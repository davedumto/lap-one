import { clamp } from './util';
import type { DriveState } from './drive';

export interface AudioEngine {
  readonly on: boolean;
  readonly musicOn: boolean;
  music: (v: boolean) => void;
  hold: (h: boolean) => void;
  enable: (v: boolean) => void;
  update: (d: DriveState, dt: number, brakeZone: number, speed01: number) => void;
  dispose: () => void;
}

// Physical-ish V8: every cylinder firing is a noisy exhaust burst + low thump, fed through resonant exhaust pipes (feedback combs).
// Firing rate of a 4-stroke V8 = rpm / 15 Hz; uneven firing intervals give the cross-plane burble.
export function createAudio(): AudioEngine {
  let ctx: AudioContext | null = null, on = false, shutting = false, musicOn = false;
  let musicBus: GainNode, comp: DynamicsCompressorNode, mTimer: ReturnType<typeof setInterval> | null = null, master: GainNode;
  const eng: { node?: ScriptProcessorNode; out?: GainNode; body?: BiquadFilterNode; wl?: BiquadFilterNode } = {};
  let noiseBuf: AudioBuffer, tyreG: GainNode, windG: GainNode, popBus: GainNode, lastPop = 0;
  const T = (p: AudioParam, v: number, t = 0.05) => p.setTargetAtTime(v, ctx!.currentTime, t);
  const st = { rpmT: 900, thrT: 0 };
  let disposed = false;

  function mkNoise(): AudioBuffer {
    const b = ctx!.createBuffer(1, ctx!.sampleRate * 2, ctx!.sampleRate), d = b.getChannelData(0);
    let l = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; l = (l + 0.04 * w) / 1.04; d[i] = w * 0.6 + l * 3; }
    return b;
  }
  const loopNoise = (): AudioBufferSourceNode => { const s = ctx!.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(); return s; };

  function engineNode(): ScriptProcessorNode {
    const sr = ctx!.sampleRate, sp = ctx!.createScriptProcessor(1024, 0, 1);
    const SEQ = [1, 0.8, 1.14, 0.88, 1.06, 0.84, 1.12, 0.96];
    const d1 = Math.round(sr / 112), d2 = Math.round(sr / 187), d3 = Math.round(sr / 331);
    const c1 = new Float32Array(d1), c2 = new Float32Array(d2), c3 = new Float32Array(d3);
    let i1 = 0, i2 = 0, i3 = 0, l1 = 0, l2 = 0, l3 = 0, ph = 0, cyl = 0, rpm = 900, thr = 0, env = 0, thump = 0, tph = 0, b1 = 0, b2 = 0, hp = 0;
    sp.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      for (let n = 0; n < out.length; n++) {
        rpm += (st.rpmT - rpm) * 0.0007; thr += (st.thrT - thr) * 0.0015;
        const f = rpm / 15;
        ph += (f / sr) / SEQ[cyl];
        if (ph >= 1) { ph -= 1; cyl = (cyl + 1) & 7; env = (0.55 + 0.9 * thr) * (0.8 + Math.random() * 0.4); thump = (0.5 + 0.8 * thr) * (0.85 + Math.random() * 0.3); tph = 0; }
        const rn = clamp(rpm / 8000);
        env *= Math.exp(-1 / (sr * (0.0042 - 0.0026 * rn))); thump *= Math.exp(-1 / (sr * 0.011));
        tph += (6.2832 * (48 + f * 0.35)) / sr;
        const q = ph / 0.42, pu = q < 1 ? Math.pow(Math.sin(Math.PI * q), 2) : 0; // exhaust pressure pulse
        const x = pu * env * 1.25 + (Math.random() * 2 - 1) * pu * env * 0.3 + Math.sin(tph) * thump * 0.8;
        const a = 1 - Math.exp((-6.2832 * (380 + rpm * 0.5 + thr * 2600)) / sr);
        b1 += a * (x - b1); b2 += a * (b1 - b2);
        const y1 = c1[i1], y2 = c2[i2], y3 = c3[i3];
        l1 += 0.4 * ((b2 + y1 * 0.74) - l1); l2 += 0.45 * ((b2 + y2 * 0.64) - l2); l3 += 0.5 * ((b2 * 0.7 + y3 * 0.55) - l3);
        c1[i1] = l1; c2[i2] = l2; c3[i3] = l3;
        if (++i1 >= d1) i1 = 0; if (++i2 >= d2) i2 = 0; if (++i3 >= d3) i3 = 0;
        let o = b2 * 0.45 + y1 * 0.55 + y2 * 0.45 + y3 * 0.3;
        hp += 0.0006 * (o - hp); o -= hp; // remove DC
        out[n] = Math.tanh(o * (1.5 + thr * 1.2)) * 0.8;
      }
    };
    return sp;
  }

  function build() {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    noiseBuf = mkNoise();
    master = ctx.createGain(); master.gain.value = 0;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
    master.connect(comp); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(comp);
    mDelay();
    eng.node = engineNode();
    eng.out = ctx.createGain(); eng.out.gain.value = 0.4;
    eng.body = ctx.createBiquadFilter(); eng.body.type = 'peaking'; eng.body.frequency.value = 160; eng.body.gain.value = 4; eng.body.Q.value = 0.9;
    eng.node.connect(eng.body); eng.body.connect(eng.out); eng.out.connect(master);
    // keep the processor alive
    const mute = ctx.createGain(); mute.gain.value = 0; eng.node.connect(mute); mute.connect(ctx.destination);
    tyreG = ctx.createGain(); tyreG.gain.value = 0;
    const tb = ctx.createBiquadFilter(); tb.type = 'bandpass'; tb.frequency.value = 1500; tb.Q.value = 4;
    loopNoise().connect(tb); tb.connect(tyreG); tyreG.connect(master);
    windG = ctx.createGain(); windG.gain.value = 0;
    const wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 700; eng.wl = wl;
    loopNoise().connect(wl); wl.connect(windG); windG.connect(master);
    popBus = ctx.createGain(); popBus.gain.value = 1; popBus.connect(master);
  }

  // ---- background trap loop, fully synthesized (140 bpm, F minor): 808 bass, clap, hats with rolls, dark plucks, pad
  let dly: DelayNode, mNext = 0, mStep = 0;
  function mDelay() {
    dly = ctx!.createDelay(1); dly.delayTime.value = (60 / 140) * 0.75;
    const fb = ctx!.createGain(); fb.gain.value = 0.34;
    const lpf = ctx!.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 2200;
    const wet = ctx!.createGain(); wet.gain.value = 0.5;
    dly.connect(lpf); lpf.connect(fb); fb.connect(dly); lpf.connect(wet); wet.connect(musicBus);
  }
  const ROOTS = [43.65, 34.65 * 2, 38.89 * 2, 43.65];            // per bar (808 sits an octave up for small speakers on Db/Eb)
  const MEL = [[698.5, 523.3, 415.3, 523.3, 622.3, 523.3, 415.3, 349.2], [554.4, 415.3, 349.2, 415.3, 523.3, 415.3, 349.2, 277.2], [622.3, 466.2, 392, 466.2, 587.3, 466.2, 392, 311.1], [698.5, 523.3, 415.3, 523.3, 784, 698.5, 523.3, 415.3]];
  const PAD = [[174.6, 207.7, 261.6], [138.6, 174.6, 207.7], [155.6, 196, 233.1], [174.6, 207.7, 261.6]];
  const nz = (t: number, dur: number, f0: number, type: BiquadFilterType, g: number, dest?: AudioNode | null, q = 0.7) => {
    const s = ctx!.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 1;
    const fl = ctx!.createBiquadFilter(); fl.type = type; fl.frequency.value = f0; fl.Q.value = q; const e = ctx!.createGain();
    e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl); fl.connect(e); e.connect(dest || musicBus); s.start(t, Math.random() * 1.4, dur + 0.02);
  };
  function k808(t: number, f: number, len: number) {
    const o = ctx!.createOscillator(), g = ctx!.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 3.2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.95, t + 0.006); g.gain.setTargetAtTime(0.0, t + len * 0.55, len * 0.22);
    const sh = ctx!.createWaveShaper(), cu = new Float32Array(256); for (let i = 0; i < 256; i++) cu[i] = Math.tanh(((i / 127.5) - 1) * 1.8); sh.curve = cu;
    o.connect(sh); sh.connect(g); g.connect(musicBus); o.start(t); o.stop(t + len + 0.2);
  }
  function pluck(t: number, f: number, g0: number) {
    const o = ctx!.createOscillator(), o2 = ctx!.createOscillator(), fl = ctx!.createBiquadFilter(), g = ctx!.createGain();
    o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.004;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(3000, t); fl.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(g0, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
    o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(musicBus); g.connect(dly); o.start(t); o2.start(t); o.stop(t + 0.55); o2.stop(t + 0.55);
  }
  function pad(t: number, notes: number[], len: number) {
    notes.forEach((f, i) => {
      [-6, 6].forEach((dd) => {
        const o = ctx!.createOscillator(), fl = ctx!.createBiquadFilter(), g = ctx!.createGain(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dd + i;
        fl.type = 'lowpass'; fl.frequency.value = 520; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.022, t + 0.5); g.gain.linearRampToValueAtTime(0, t + len);
        o.connect(fl); fl.connect(g); g.connect(musicBus); o.start(t); o.stop(t + len + 0.05);
      });
    });
  }
  function mSched() {
    if (!ctx || !musicOn) return;
    const SPB = 60 / 140 / 4;
    while (mNext < ctx.currentTime + 0.18) {
      const bar = Math.floor(mStep / 16) % 4, st16 = mStep % 16, t = mNext;
      const r = ROOTS[bar];
      if (st16 === 0) { k808(t, r, 0.95); pad(t, PAD[bar], SPB * 16); }
      if (st16 === 6) k808(t, r, 0.28);
      if (st16 === 10) k808(t, r * (bar === 3 ? 1.5 : 1), 0.4);
      if (st16 === 14 && bar % 2) k808(t, r * 1.335, 0.2);
      if (st16 === 0 || st16 === 10) nz(t, 0.03, 1800, 'bandpass', 0.18);
      if (st16 === 8) { nz(t, 0.16, 1500, 'bandpass', 0.55, null, 0.9); nz(t + 0.012, 0.14, 1900, 'bandpass', 0.4, null, 0.9); nz(t, 0.18, 220, 'lowpass', 0.25); }
      // hats: steady 16ths with accents, 32nd rolls and a triplet burst
      const acc = [1, .35, .6, .35, .8, .35, .6, .4, 1, .35, .6, .35, .8, .4, .6, .4][st16];
      nz(t, 0.035, 8200, 'highpass', 0.16 * acc);
      if (st16 === 12 && bar % 2 === 0) nz(t, 0.22, 7600, 'highpass', 0.1);
      if (bar % 2 && st16 >= 12) nz(t + SPB / 2, 0.03, 8200, 'highpass', 0.1);
      if (bar === 1 && st16 === 6) { nz(t + SPB / 3, 0.03, 8200, 'highpass', 0.1); nz(t + 2 * SPB / 3, 0.03, 8200, 'highpass', 0.1); }
      if (st16 % 2 === 0 && Math.random() > 0.18) { const f = MEL[bar][st16 / 2]; pluck(t, f, 0.075 + (st16 % 4 === 0 ? 0.03 : 0)); }
      mNext += SPB; mStep++;
    }
  }

  function pop(g = 0.6, f = 380) {
    if (!ctx || (!on && !shutting)) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.7 + Math.random() * 0.8;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f * (0.8 + Math.random() * 0.8); lp.Q.value = 3;
    const e = ctx.createGain(), t = ctx.currentTime;
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.004); e.gain.exponentialRampToValueAtTime(0.001, t + 0.09 + Math.random() * 0.08);
    s.connect(lp); lp.connect(e); e.connect(popBus); s.start(t, Math.random() * 1.5, 0.25);
  }

  return {
    get on() { return on; },
    get musicOn() { return musicOn; },
    music(v: boolean) {
      if (v && !ctx) build();
      if (!ctx) return;
      if (v) { ctx.resume(); if (!musicOn) { musicOn = true; mNext = ctx.currentTime + 0.08; mStep = 0; } T(musicBus.gain, 0.5, 0.5); if (!mTimer) mTimer = setInterval(mSched, 30); }
      else { musicOn = false; T(musicBus.gain, 0, 0.25); setTimeout(() => { if (!musicOn && mTimer) { clearInterval(mTimer); mTimer = null; } }, 1500); }
    },
    hold(h: boolean) { if (!ctx) return; if (h) ctx.suspend(); else if (on || musicOn || shutting) ctx.resume(); },
    enable(v: boolean) {
      if (v && !ctx) build();
      if (!ctx) { on = false; return; }
      if (v) {
        shutting = false; on = true; ctx.resume();
        T(master.gain, 0.9, 0.25);
        return;
      }
      if (!on) return;
      on = false; shutting = true;
      // engine off: ignition cut, revs fall away with a few lumpy chugs, a last backfire and a dull thunk
      const r0 = Math.max(st.rpmT, 900), t0 = performance.now();
      st.thrT = 0; pop(0.5, 420);
      const popped = [false, false, false];
      const tick = () => {
        if (!shutting || disposed) return;
        const t = (performance.now() - t0) / 1000, k = clamp(t / 1.5);
        st.rpmT = Math.max(60, r0 * Math.pow(1 - k, 2.2) * (0.92 + 0.08 * Math.sin(t * 38)));
        st.thrT = 0;
        T(eng.out!.gain, 0.5 * (1 - k * 0.6), 0.04);
        ([0.12, 0.34, 0.6] as const).forEach((pt, i) => { if (!popped[i] && t > pt) { popped[i] = true; pop(0.55 - i * 0.12, 360 - i * 60); } });
        if (t >= 1.5) {
          const o = ctx!.createOscillator(), g = ctx!.createGain(), n = ctx!.currentTime;
          o.frequency.setValueAtTime(70, n); o.frequency.exponentialRampToValueAtTime(32, n + 0.22);
          g.gain.setValueAtTime(0.55, n); g.gain.exponentialRampToValueAtTime(0.001, n + 0.28);
          o.connect(g); g.connect(master); o.start(n); o.stop(n + 0.3);
          T(master.gain, 0, 0.12); shutting = false; st.rpmT = 900; return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    update(d: DriveState, dt: number, brakeZone: number, speed01: number) {
      if (!ctx || !on) return;
      const duck = d.shift > 0.3 ? 0.3 : 1;
      st.rpmT = Math.max(700, d.rpm * 8000); st.thrT = d.thr * duck;
      T(eng.out!.gain, (0.42 + d.thr * 0.5) * (0.5 + 0.5 * duck), 0.04);
      T(tyreG.gain, clamp(brakeZone * speed01 * 0.4 + speed01 * speed01 * 0.03), 0.08);
      T(windG.gain, speed01 * speed01 * 0.2, 0.12); T(eng.wl!.frequency, 300 + speed01 * 1400, 0.1);
      const now = performance.now();
      if (d.upshift) { pop(0.55, 500); pop(0.35, 300); }
      if (d.downshift) pop(0.5, 420);
      if (d.thr < 0.12 && d.rpm > 0.42 && now - lastPop > 70 && Math.random() < dt * 12) { pop(0.3 + Math.random() * 0.3, 330); lastPop = now; }
    },
    dispose() {
      disposed = true; shutting = false;
      if (mTimer) { clearInterval(mTimer); mTimer = null; }
      if (ctx) { ctx.close().catch(() => {}); ctx = null; }
    },
  };
}
