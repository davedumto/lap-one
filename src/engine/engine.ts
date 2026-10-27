import * as THREE from 'three';
import { clamp, lerp, sstep, easeOut, makePchip } from './util';
import { at, LENGTH } from './track';
import { createDrive } from './drive';
import { createAudio, type AudioEngine } from './audio';
import { initPanels, type PanelsUI } from './panels';
import { createScrollModel, updateScroll, cancelGlide, glideTo, type ScrollModelState } from './scrollModel';
import { camAt } from './cameraRig';
import { buildPostFX, type PostFX } from './postFX';
import { bootScene, type BootResult } from './bootSequence';
import { DisposalRegistry } from './disposables';
import { pickStartingTier, detectDeviceHeuristic, tierConfig, FrameTimeMonitor, downgradeFrom, type QualityTier } from './qualityTiers';
import { getDevHooks, setFrameCount, setReady, shouldAutoEnter } from './devHooks';
import type { EngineRefs, EngineCallbacks } from './types';

export interface Engine {
  enter: (withSound: boolean) => void;
  dispose: () => void;
}

const MOBILE = () => window.innerWidth <= 820;

export function initEngine(carGlbUrl: string, refs: EngineRefs, cb: EngineCallbacks): Engine {
  const registry = new DisposalRegistry();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: refs.canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  } catch (e) {
    cb.onFatalError(e);
    throw e;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x2a1c16, 0.0042);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 3000);
  scene.add(camera);

  let tier: QualityTier = pickStartingTier(detectDeviceHeuristic(renderer.getContext()));
  const frameMonitor = new FrameTimeMonitor();
  cb.onQualityTierChange(tier);

  const scroll: ScrollModelState = createScrollModel();
  const U_AT = makePchip([0, .55, 1.0, 1.6, 2.0, 2.6, 3.0, 3.35, 3.7, 4.0, 4.4, 4.8, 5.0], [0, 0, .012, .045, .075, .125, .158, .168, .19, .30, .62, .90, .985]);
  const SPEED_AT = makePchip([0, .5, 1.2, 2.0, 2.7, 3.0, 3.35, 3.8, 4.4, 4.8, 5.0], [0, 12, 120, 170, 210, 235, 88, 190, 318, 180, 70]);

  const drive = createDrive();
  const audio: AudioEngine = createAudio();
  let flare = 0, crankT = -1, entered = false;

  function enter(withSound: boolean) {
    if (entered) return;
    entered = true; readyAt = performance.now(); orbit0 = preOrbit;
    if (withSound) { setSound(true); setMusic(true); crankT = 0; }
    window.scrollTo(0, 0);
    cb.onLoaderPhase('entered');
  }

  const setSound = (v: boolean) => { audio.enable(v); cb.onSoundChange(audio.on); };
  const setMusic = (v: boolean) => { audio.music(v); cb.onMusicChange(audio.musicOn); };
  refs.soundBtn.addEventListener('click', () => { autoOff = false; setSound(!audio.on); });
  refs.musicBtn.addEventListener('click', () => setMusic(!audio.musicOn));
  let autoOff = false, autoOffDone = false;
  const onVisibility = () => audio.hold(document.hidden);
  document.addEventListener('visibilitychange', onVisibility);

  refs.enterSoundBtn.addEventListener('click', () => enter(true));
  refs.enterMuteBtn.addEventListener('click', () => enter(false));

  const ui: PanelsUI = initPanels(refs, (c) => { glideTo(scroll, c); if (c > 0 && c < 2) flare = 1; });

  const onWheel = () => cancelGlide(scroll);
  const onTouch = () => cancelGlide(scroll);
  const onKeydown = (e: KeyboardEvent) => { if (/Arrow|Page|Space|Home|End/.test(e.code || e.key)) cancelGlide(scroll); };
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('touchstart', onTouch, { passive: true });
  window.addEventListener('keydown', onKeydown);

  // boot
  let preT = 0, preOrbit = 0, orbit0 = 0, lapT0 = -1, lapDone = false, finishFired = false, frames = 0;
  let ready = false, readyAt = 0;
  let boot: BootResult | null = null;
  let postFX: PostFX | null = null;
  let disposed = false;
  let rafId = 0;

  function resize() {
    if (!boot || !postFX) return;
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, Math.min(MOBILE() ? 1.75 : 2, tierConfig(tier).pixelRatioCap));
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    postFX.resize(w, h, dpr);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  const UP = new THREE.Vector3(0, 1, 0);
  let CX = 0, CZ = 0, SPAN = 0;
  let wSm = 0, last = performance.now(), wheelA = 0, prevU = 0, kmh = 0;
  const tmpV = new THREE.Vector3(), camP = new THREE.Vector3(), lookP = new THREE.Vector3();

  async function bootAndStart() {
    try {
      boot = await bootScene(scene, renderer, carGlbUrl, registry, {
        onStep: (fraction, _note) => cb.onLoadProgress(fraction),
      });
      refs.minimapPathBg.setAttribute('d', boot.mm.d);
      refs.minimapPathProgress.setAttribute('d', boot.mm.d);
      refs.loaderTrackPathBg.setAttribute('d', boot.mm.d);
      refs.loaderTrackPathDraw.setAttribute('d', boot.mm.d);
      const [sx, sy] = boot.mm.map(at(0).p);
      refs.minimapStart.setAttribute('cx', String(sx)); refs.minimapStart.setAttribute('cy', String(sy));

      postFX = buildPostFX(renderer, scene, camera);
      resize();
      cb.onLoadProgress(0.92);
      postFX.composer.render();
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      cb.onLoadProgress(1);
      ready = true;

      const bb = boot.mm.bounds;
      CX = (bb.minX + bb.maxX) / 2; CZ = (bb.minZ + bb.maxZ) / 2; SPAN = Math.max(bb.maxX - bb.minX, bb.maxZ - bb.minZ);

      setReady();
      if (shouldAutoEnter()) enter(false); else cb.onLoaderPhase('ready');
      rafId = requestAnimationFrame(frame);
    } catch (e) {
      cb.onFatalError(e);
    }
  }

  function frame(now: number) {
    if (disposed) return;
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!ready || !boot || !postFX) return;

    const hooks = getDevHooks();
    const forced = hooks.__forceC;
    if (hooks.__hold) {
      if (!hooks.__once) return;
      hooks.__once = false;
    }
    updateScroll(scroll, now, dt, forced, entered, reduceMotion);
    const c = scroll.S, vS = scroll.vS;
    const rt = entered ? (now - readyAt) / 1000 : 0;

    // car
    const u = U_AT(c), a = at(u), mob = MOBILE();
    const dU = u - prevU; prevU = u;
    const dW = (dU * LENGTH) / 0.355; wheelA += dW;
    const omega = dt > 0 ? Math.abs(dW) / dt : 0; wSm = lerp(wSm, omega, 1 - Math.exp(-dt * 10));
    const a2 = at(u + 5 / LENGTH); let dy = a2.yaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const curv = dy / 5, steer = clamp(Math.atan(2.7 * curv) * 1.6, -0.5, 0.5);
    boot.carObj.spin(wheelA, steer);
    if (hooks.__wsm !== undefined) wSm = hooks.__wsm;
    const bl = sstep(9, 30, wSm); boot.carObj.blurMat.opacity = 0.9 * bl;
    // road feel: tiny high-frequency body vibration that grows with speed
    const vib = clamp(kmh / 300) * (0.4 + 0.6 * clamp(wSm / 30));
    (boot.carObj.rig.children[0] as THREE.Object3D).position.y = (Math.sin(now * 0.052) + Math.sin(now * 0.0337) * 0.7) * 0.0018 * vib;
    boot.rig.position.copy(a.p); boot.rig.rotation.set(0, a.yaw, 0);
    const brake = sstep(2.75, 3.0, c) * (1 - sstep(3.3, 3.45, c));
    boot.rig.rotation.z = -steer * 0.05; // roll
    boot.rig.rotation.x = 0;
    const pitch = -brake * 0.012; (boot.carObj.rig.children[0] as THREE.Object3D).rotation.z = pitch; // nose dive about local z

    // phase variables
    const night = sstep(3.1, 3.85, c), ov = sstep(4.55, 4.98, c);
    const sp = SPEED_AT(c), live = 0.45 + 0.55 * clamp(Math.abs(vS) / 0.5 + (forced !== undefined ? 1 : 0));
    kmh = lerp(kmh, sp * live, 1 - Math.exp(-dt * 8));
    drive.update(kmh, dt, vS, brake);
    if (crankT >= 0) {
      crankT += dt; const q = crankT;
      drive.rpm = q < 1.1 ? 0.03 + 0.2 * (q / 1.1) : q < 1.5 ? 0.23 + 0.5 * Math.sin(((q - 1.1) / 0.4) * Math.PI * 0.5) : 0.73 - 0.62 * sstep(1.5, 2.6, q);
      drive.thr = q > 1.1 && q < 1.6 ? 0.9 : 0.05;
      if (q > 2.7) crankT = -1;
    } else if (flare > 0) {
      flare = Math.max(0, flare - dt * 1.6); drive.rpm += 0.32 * Math.sin(flare * Math.PI); drive.thr = Math.max(drive.thr, 0.8 * flare);
    }
    audio.update(drive, dt, brake, clamp(kmh / 320));
    // lap timer: starts once you pull away from the grid, stops at the flag
    if (entered && forced === undefined) {
      if (lapT0 < 0 && c > 0.5) { lapT0 = now; lapDone = false; }
      if (lapT0 >= 0 && !lapDone && c > 4.93) {
        lapDone = true;
        const ms = now - lapT0, mm_ = Math.floor(ms / 60000), ss = Math.floor((ms % 60000) / 1000), mls = Math.floor(ms % 1000);
        const text = `${mm_}:${String(ss).padStart(2, '0')}.${String(mls).padStart(3, '0')}`;
        refs.lapTimeEl.textContent = text;
        cb.onFlagReached(text);
      }
      if (c < 0.3) { lapT0 = -1; lapDone = false; }
    }
    if (c > 4.93 && audio.on && !autoOffDone) { autoOffDone = true; autoOff = true; setSound(false); }
    else if (c < 4.4 && autoOff) { autoOff = false; autoOffDone = false; setSound(true); }
    else if (c < 4.8 && !autoOff) autoOffDone = false;

    // camera
    const k = camAt(c); const [d, az, el, lx, ly, lz, fov, shx] = k;
    let dist = d * (mob ? 1.12 : 1);
    if (!entered) { preT += dt; preOrbit = Math.sin(preT * 0.42) * 0.9; }
    const intro = entered ? lerp(0.78, 1, easeOut(clamp(rt / 3.0))) : 0.78; dist *= lerp(1.6, 1, intro);
    const orbitOff = entered ? orbit0 * (1 - sstep(0, 2.4, rt)) : preOrbit;
    const azr = (az * Math.PI) / 180 + orbitOff, elr = (el * Math.PI) / 180;
    tmpV.set(lx + -dist * Math.cos(elr) * Math.cos(azr), ly + dist * Math.sin(elr), lz + dist * Math.cos(elr) * Math.sin(azr)).applyAxisAngle(UP, a.yaw);
    camP.copy(a.p).add(tmpV);
    lookP.set(lx, ly, lz).applyAxisAngle(UP, a.yaw).add(a.p);
    if (ov > 0) {
      const asp = camera.aspect, tanH = Math.tan((40 * Math.PI) / 360);
      const H = Math.max((SPAN * 0.56) / tanH, (SPAN * 0.56) / (tanH * asp)) * 1.02;
      const e = ov * ov * (3 - 2 * ov);
      camP.lerp(tmpV.set(CX, H, CZ + H * 0.06), e); lookP.lerp(tmpV.set(CX, 0, CZ), e);
    }
    camera.position.copy(camP); camera.lookAt(lookP);
    const fovT = lerp(fov, 40, ov) * (mob ? 1.18 : 1) * lerp(1.12, 1, intro);
    if (Math.abs(camera.fov - fovT) > 1e-3) { camera.fov = fovT; camera.updateProjectionMatrix(); }
    const W = window.innerWidth, Hh = window.innerHeight, sh = mob ? 0 : shx * (1 - ov * 0.0);
    camera.setViewOffset(W, Hh, -sh * W, mob ? 0.2 * Hh : 0, W, Hh);

    // environment / light
    const fogC = new THREE.Color().lerpColors(new THREE.Color(0x2a1c16), new THREE.Color(0x06080d), night);
    (scene.fog as THREE.FogExp2).color.copy(fogC); (scene.fog as THREE.FogExp2).density = lerp(0.0042, 0.0013, night) * lerp(1, 0.05, ov);
    scene.background = fogC;
    const U = boot.worldObj.skyMat.uniforms;
    (U.uHor.value as THREE.Color).lerpColors(new THREE.Color(0x4a2c1c), new THREE.Color(0x0a0e18), night);
    U.uNight.value = night;
    boot.worldObj.sky.position.copy(camera.position);
    (scene.userData.key as THREE.DirectionalLight).intensity = lerp(2.6, 0.35, night);
    (scene.userData.hemi as THREE.HemisphereLight).intensity = lerp(0.35, 0.28, night);
    for (const m of boot.envMats) m.envMapIntensity = (m as unknown as { _e0: number })._e0 * lerp(1, 0.5, night);
    renderer.toneMappingExposure = lerp(1.0, 1.15, night) * (1 - ov * 0.25);
    boot.spots.forEach((s) => { s.intensity = lerp(8, 220, night); });
    boot.tail.intensity = lerp(0.4, 1.6, night) + brake * 3;
    boot.trackObj.mat.opacity = lerp(0.86, 0.94, ov);
    boot.trackObj.gantry.update(u, night); boot.sceneryObj.update(night);
    boot.carObj.lights.forEach((m) => { if (m.emissiveIntensity !== undefined) m.emissiveIntensity = lerp(1, 4, night); });

    // brakes + sparks
    const hot = 3.6 * sstep(2.7, 3.05, c) * (1 - sstep(3.45, 4.3, c)) + 0.0;
    boot.carObj.disc.forEach((m) => { m.emissiveIntensity = hot; }); boot.carObj.heatMat.opacity = clamp(hot / 3.2) * bl * 0.5;
    if (brake > 0.2 && Math.abs(dU) > 1e-6) {
      const n = Math.min(6, Math.floor(Math.abs(dU) * LENGTH * 2.2) + 1);
      const fwd = tmpV.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
      for (const wz of [-0.86, 0.86]) {
        const p = new THREE.Vector3(1.4, 0.15, wz).applyAxisAngle(UP, a.yaw).add(a.p);
        boot.sparks.userData.emit(p, new THREE.Vector3(-fwd.x * 4, 0, -fwd.z * 4).multiplyScalar(Math.sign(dU) || 1), n, 3.4);
      }
    }
    boot.sparks.userData.update(dt);

    // streamlines
    const sAmt = sstep(1.6, 2.05, c) * (1 - sstep(2.7, 3.0, c));
    boot.smoke.visible = sAmt > 0.01;
    if (boot.smoke.visible) boot.smoke.userData.update(dt, sAmt, 0.8 + clamp(Math.abs(vS) * 3, 0, 4), renderer.domElement.height * 0.5 / Math.tan((camera.fov * Math.PI) / 360));
    boot.streams.visible = sAmt > 0.01;
    boot.streams.material.uniforms.uA.value = sAmt;
    boot.streams.material.uniforms.uT.value += dt * (0.5 + clamp(Math.abs(vS) * 3, 0, 4));

    // warp streaks
    const sp01 = clamp(kmh / 320), wAmt = sstep(0.25, 0.6, sp01) * (1 - ov) * (c > 1 ? 1 : 0);
    boot.warp.visible = wAmt > 0.01;
    if (boot.warp.visible) boot.warp.userData.update(a.p, a.t, tmpV.set(-a.t.z, 0, a.t.x).clone(), wAmt, dt, 40 + kmh * 0.4);
    boot.warp.material.opacity = wAmt;
    postFX.post.uniforms.uWarp.value = sstep(0.55, 1, sp01) * (1 - ov) * clamp(Math.abs(vS) * 1.6 + (forced !== undefined ? 0.4 : 0), 0, 1);
    postFX.post.uniforms.uCA.value = 0.0005 + clamp(Math.abs(vS), 0, 2) * 0.0009;
    postFX.post.uniforms.uT.value = (now % 1000) / 1000;
    postFX.post.uniforms.uFade.value = 0;
    postFX.bloom.strength = lerp(0.42, 0.75, night) * (1 - ov * 0.78) * (tierConfig(tier).bloom ? 1 : 0);
    postFX.bloom.threshold = lerp(0.88, 1.1, ov);

    // start lights
    const lt = rt - 1.0;
    boot.startL.set(c > 0.14 ? 0 : lt < 0 ? 0 : lt < 2.5 ? Math.min(5, Math.floor(lt / 0.5) + 1) : lt < 3.4 ? 5 : 0);

    // racing line trail + finish burst
    const prog = clamp(u / 0.985);
    boot.line.geometry.setDrawRange(0, Math.floor(prog * boot.line.userData.N) * 6);
    boot.line.material.uniforms.uA.value = lerp(0.55, 0.5, ov); boot.line.material.uniforms.uW.value = lerp(0.7, 12, ov);
    if (c > 4.93 && !finishFired) {
      finishFired = true; const p = at(0.0).p;
      for (let i = 0; i < 6; i++) boot.sparks.userData.emit(new THREE.Vector3(p.x, 9, p.z), new THREE.Vector3(0, 12, 0), 40, 16);
    } else if (c < 4.8) finishFired = false;

    ui.update({ c, dt, mob, now, u, kmh, drive, vS, mm: boot.mm, at, prog });
    postFX.composer.render(dt);
    frames++;
    setFrameCount(frames);

    // quality downgrade check (runs after render so this frame's own time is included)
    const frameMs = dt * 1000;
    const shouldDowngrade = frameMonitor.recordFrame(frameMs, now, { loading: !ready, hidden: document.hidden, entered });
    if (shouldDowngrade) {
      const next = downgradeFrom(tier);
      if (next !== tier) { tier = next; cb.onQualityTierChange(tier); resize(); }
    }
  }

  bootAndStart();

  return {
    enter,
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouch);
      window.removeEventListener('keydown', onKeydown);
      document.removeEventListener('visibilitychange', onVisibility);
      audio.dispose();
      postFX?.dispose();
      registry.disposeAll();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          ms.forEach((m) => {
            const mat = m as THREE.Material & { map?: THREE.Texture | null };
            if (mat.map) mat.map.dispose();
            mat.dispose();
          });
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
