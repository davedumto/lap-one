import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { clamp, lerp, sstep, easeOut, smoothDamp, makePchip, splineRows } from './util.js';
import { at, buildTrack, minimapPath, LENGTH } from './track.js';
import { loadCar, makeEnv, buildRig } from './car.js';
import { buildWorld } from './world.js';
import { buildScenery } from './scenery.js';
import { buildStreams, buildSmoke, buildWarp, buildSparks, buildStartLights, buildLine } from './fx.js';
import { initPanels } from './panels.js';
import { createDrive } from './drive.js';
import { createAudio } from './audio.js';

const $ = (s) => document.querySelector(s);
const MOBILE = () => innerWidth <= 820;
const canvas = $('#gl');
const loaderFill = $('#lfill'), loaderEl = $('#loader');
const ldLights = [...document.querySelectorAll('.ld-lights i')];
const step = (p, note) => { loaderFill.style.transform = `scaleX(${p})`; if (note) $('#lnote').textContent = note; ldLights.forEach((l, i) => l.classList.toggle('on', p >= (i + 0.6) / 5)); };

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
} catch (e) {
  document.body.classList.add('nogl'); loaderEl.classList.add('done'); throw e;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x2a1c16, 0.0042);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 3000);
scene.add(camera);

// ---------- scroll model ----------
const CMAX = 5;
const st = { v: 0 }, st1 = { v: 0 };
let S1 = 0, idleT = 0, expectedY = 0, cruiseAcc = 0;
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
let S = 0, vS = 0, cTarget = 0;
const docRange = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
const readC = () => clamp(scrollY / docRange(), 0, 1) * CMAX;
const cToY = (c) => (c / CMAX) * docRange();

const U_AT = makePchip([0, .55, 1.0, 1.6, 2.0, 2.6, 3.0, 3.35, 3.7, 4.0, 4.4, 4.8, 5.0], [0, 0, .012, .045, .075, .125, .158, .168, .19, .30, .62, .90, .985]);
const SPEED_AT = makePchip([0, .5, 1.2, 2.0, 2.7, 3.0, 3.35, 3.8, 4.4, 4.8, 5.0], [0, 12, 120, 170, 210, 235, 88, 190, 318, 180, 70]);

// camera keys [c, d, az, el, lx,ly,lz, fov, shiftX]
const KEYS = [[0,11.5,-34,6,1.2,.7,0,32,.13],[.45,9.4,-60,5,.9,.66,0,31,.15],[.85,6.6,-92,3.5,.2,.6,0,29,-.18],[1.2,6,-142,4.5,.4,.58,0,28,-.18],[1.5,6.4,-182,6,.4,.55,0,29,-.18],[1.85,7.4,-246,6,0,.55,0,30,.18],[2.2,8,-272,7,-.2,.55,0,30,.18],[2.6,9.5,-300,34,-.2,.55,0,32,.18],[2.9,3.4,-246,3,1.4,.38,.9,27,-.2],[3.3,3,-236,1.5,1.4,.36,.9,26,-.2],[3.7,9.5,-330,7,1.2,.7,0,46,.14],[4,9,-360,5,4,.75,0,58,.14],[4.5,8.2,-362,3.5,6,.8,0,68,0],[4.8,12,-372,22,3,.6,0,50,.14],[5,16,-380,40,0,.6,0,40,.24]];
const TAB_N = 700;
const TAB = (() => {
  const rows = [];
  for (let i = 0; i < TAB_N; i++) {
    const c = (i / (TAB_N - 1)) * CMAX;
    let k = 0; while (k < KEYS.length - 2 && c > KEYS[k + 1][0]) k++;
    const f = clamp((c - KEYS[k][0]) / (KEYS[k + 1][0] - KEYS[k][0]));
    rows.push(splineRows(KEYS.map((r) => r.slice(1)), k + f * f * (3 - 2 * f) * 0 + f));
  }
  for (let pass = 0; pass < 3; pass++) {
    const R = 9;
    const out = rows.map((r, i) => r.map((_, j) => { let s = 0, n = 0; for (let q = -R; q <= R; q++) { const ii = clamp(i + q, 0, TAB_N - 1); s += rows[ii][j]; n++; } return s / n; }));
    out.forEach((r, i) => { rows[i] = r; });
  }
  return rows;
})();
const camAt = (c) => { const t = clamp(c / CMAX) * (TAB_N - 1), i = Math.min(TAB_N - 2, Math.floor(t)), f = t - i; return TAB[i].map((v, j) => lerp(v, TAB[i + 1][j], f)); };

// ---------- panels / HUD ----------
const drive = createDrive(), audio = createAudio();
let flare = 0, crankT = -1, entered = false;
const ui = initPanels({
  go(c) { glideTo(c); if (c > 0 && c < 2) flare = 1; },
});
const sndBtn = $('#snd');
const setSound = (v) => { audio.enable(v); sndBtn.setAttribute('aria-pressed', String(audio.on)); sndBtn.querySelector('.st').textContent = audio.on ? 'On' : 'Off'; };
sndBtn.addEventListener('click', () => setSound(!audio.on));
const musBtn = $('#mus');
const setMusic = (v) => { audio.music(v); musBtn.setAttribute('aria-pressed', String(audio.musicOn)); musBtn.querySelector('.st').textContent = audio.musicOn ? 'On' : 'Off'; };
let autoOff = false, autoOffDone = false;
sndBtn.addEventListener('click', () => { autoOff = false; });
musBtn.addEventListener('click', () => setMusic(!audio.musicOn));
document.addEventListener('visibilitychange', () => audio.hold(document.hidden));
function enter(withSound) {
  if (entered) return; entered = true; readyAt = performance.now(); orbit0 = preOrbit;
  if (withSound) { setSound(true); setMusic(true); crankT = 0; }
  loaderEl.classList.add('done'); ldLights.forEach((l) => l.classList.remove('on')); scrollTo(0, 0);
}
$('#enter-snd').addEventListener('click', () => enter(true));
$('#enter-mute').addEventListener('click', () => enter(false));
let glide = null;
function glideTo(c) {
  const from = scrollY, to = cToY(c), dist = Math.abs(to - from);
  glide = { from, to, t0: performance.now(), dur: clamp(900 + dist * 0.35, 1100, 3600) };
}
const cancelGlide = () => { glide = null; };
addEventListener('wheel', cancelGlide, { passive: true }); addEventListener('touchstart', cancelGlide, { passive: true }); addEventListener('keydown', (e) => { if (/Arrow|Page|Space|Home|End/.test(e.code || e.key)) cancelGlide(); });

// ---------- boot ----------
const mm = minimapPath(120, 10);
$('#mm-bg').setAttribute('d', mm.d); $('#mm-pg').setAttribute('d', mm.d);
$('#ld-path').setAttribute('d', mm.d); $('#ld-draw').setAttribute('d', mm.d);
{ const [sx, sy] = mm.map(at(0).p); $('#mm-st').setAttribute('cx', sx); $('#mm-st').setAttribute('cy', sy); }

let preT = 0, preOrbit = 0, orbit0 = 0, lapT0 = -1, lapDone = false, smoke, sceneryObj, composer, bloom, post, rig, carObj, glow, streams, warp, sparks, startL, line, trackObj, worldObj, spots = [], tail, shadow, envMats = [];
let ready = false, readyAt = 0;

async function boot() {
  step(0.08, 'Building the circuit');
  worldObj = buildWorld(scene); trackObj = buildTrack(scene); sceneryObj = buildScenery(scene, trackObj.road.geometry);
  step(0.2, 'Lighting the pit lane');
  const env = makeEnv(renderer); scene.environment = env;
  step(0.35, 'Unpacking the car');
  const model = await loadCar(window.__GLB.car);
  step(0.7, 'Warming the tyres');
  carObj = buildRig(model, env);
  rig = carObj.rig; scene.add(rig);
  rig.traverse((o) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m.envMapIntensity !== undefined && !envMats.includes(m)) envMats.push(m); }); } });
  envMats.forEach((m) => { m._e0 = m.envMapIntensity; });

  // headlights, tail, contact shadow
  for (const z of [-0.62, 0.62]) { const s = new THREE.SpotLight(0xdfe9ff, 0, 90, 0.42, 0.9, 1.2); s.position.set(2.0, 0.62, z); s.target.position.set(30, 0, z * 0.6); rig.add(s, s.target); spots.push(s); }
  tail = new THREE.PointLight(0xff2a1a, 0, 14, 2); tail.position.set(-2.6, 0.7, 0); rig.add(tail);
  const sc = document.createElement('canvas'); sc.width = sc.height = 128; const sx = sc.getContext('2d');
  const gr = sx.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sx.fillStyle = gr; sx.fillRect(0, 0, 128, 128);
  shadow = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, 0.03, 0); shadow.renderOrder = 3; rig.add(shadow);

  const key = new THREE.DirectionalLight(0xffe2c0, 2.6); key.position.set(120, 90, -60); scene.add(key); scene.userData.key = key;
  const hemi = new THREE.HemisphereLight(0x9fb4d8, 0x14100c, 0.35); scene.add(hemi); scene.userData.hemi = hemi;

  streams = buildStreams(); rig.add(streams); smoke = buildSmoke(streams.userData.paths, streams.userData.M); rig.add(smoke);
  warp = buildWarp(); scene.add(warp);
  sparks = buildSparks(); scene.add(sparks);
  startL = buildStartLights(scene);
  line = buildLine(); scene.add(line);

  // post
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, stencilBuffer: true });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.7, 0.88); composer.addPass(bloom);
  post = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uCA: { value: 0.0006 }, uWarp: { value: 0 }, uAsp: { value: 1 }, uFade: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uT,uCA,uWarp,uAsp,uFade;
      float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+uT)*43758.5453); }
      void main(){ vec2 d = vUv-.5; float r = length(d*vec2(uAsp,1.));
        vec2 dir = normalize(d+1e-5);
        vec3 c;
        if(uWarp>.01){ vec3 a=vec3(0.); float w=0.; for(int i=0;i<8;i++){ float f=float(i)/8.; float k=1.-f*uWarp*.09*(0.4+r*2.); vec2 uv=.5+d*k; vec3 s=texture2D(tDiffuse,uv).rgb; a+=s; w+=1.; } c=a/w; }
        else c = texture2D(tDiffuse,vUv).rgb;
        float ca = uCA*(0.4+r*2.2)*(1.+uWarp*3.);
        c.r = mix(c.r, texture2D(tDiffuse,vUv+dir*ca).r, .75); c.b = mix(c.b, texture2D(tDiffuse,vUv-dir*ca).b, .75);
        c *= 1. - smoothstep(.45,1.1,r)*.5;
        c += (h(vUv*vec2(1731.,911.))-.5)*.03;
        c *= 1.-uFade;
        gl_FragColor = vec4(c,1.); }`,
  });
  composer.addPass(post);
  composer.addPass(new OutputPass());
  resize();
  step(0.92, 'Almost on the grid');
  composer.render();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  step(1, 'Lights out');
  ready = true; window.__ready = true;
  if (location.hash === '#auto') enter(false); else { loaderEl.classList.add('rdy'); }
}

function resize() {
  const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, MOBILE() ? 1.75 : 2);
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  if (composer) { composer.setPixelRatio(dpr); composer.setSize(w, h); bloom.setSize(w * dpr * 0.5, h * dpr * 0.5); post.uniforms.uAsp.value = w / h; }
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------- frame ----------
const UP = new THREE.Vector3(0, 1, 0);
const bb = mm.bounds, CX = (bb.minX + bb.maxX) / 2, CZ = (bb.minZ + bb.maxZ) / 2, SPAN = Math.max(bb.maxX - bb.minX, bb.maxZ - bb.minZ);
let wSm = 0, last = performance.now(), wheelA = 0, prevU = 0, kmh = 0, finishFired = false, frames = 0, prevS = 0;
const tmpV = new THREE.Vector3(), camP = new THREE.Vector3(), lookP = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!ready) return;
  if (window.__hold) { if (!window.__once) return; window.__once = false; }
  if (glide) {
    const t = clamp((now - glide.t0) / glide.dur), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    scrollTo(0, lerp(glide.from, glide.to, e)); if (t >= 1) glide = null;
  }
  const forced = window.__forceC;
  cTarget = forced !== undefined ? forced : readC();
  if (forced !== undefined) { S = S1 = cTarget; st.v = st1.v = 0; vS = 0; }
  else {
    // two critically-damped stages in series: soft start and soft stop, no stair-stepping from wheel ticks
    S1 = smoothDamp(S1, cTarget, st1, 0.3, dt); S = smoothDamp(S, S1, st, 0.3, dt); vS = st.v;
    // cruise: when the scroll goes idle the car keeps rolling at a gentle pace instead of freezing
    if (Math.abs(scrollY - expectedY) > 2) idleT = 0; else idleT += dt;
    expectedY = scrollY;
    if (!glide && !REDUCE && entered && !document.hidden && cTarget > 0.3 && cTarget < 4.95 && idleT > 0.6) {
      cruiseAcc += dt * 0.07 * (docRange() / CMAX);
      const px = Math.floor(cruiseAcc); if (px >= 1) { cruiseAcc -= px; scrollBy(0, px); expectedY = scrollY; }
    }
  }
  const c = S;
  const rt = entered ? (now - readyAt) / 1000 : 0;

  // car
  const u = U_AT(c), a = at(u), mob = MOBILE();
  const dU = u - prevU; prevU = u;
  const dW = (dU * LENGTH) / 0.355; wheelA += dW;
  const omega = dt > 0 ? Math.abs(dW) / dt : 0; wSm = lerp(wSm, omega, 1 - Math.exp(-dt * 10));
  const a2 = at(u + 5 / LENGTH); let dy = a2.yaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const curv = dy / 5, steer = clamp(Math.atan(2.7 * curv) * 1.6, -0.5, 0.5);
  carObj.spin(wheelA, steer);
  if (window.__wsm !== undefined) wSm = window.__wsm;
  const bl = sstep(9, 30, wSm); carObj.blurMat.opacity = 0.9 * bl;
  // road feel: tiny high-frequency body vibration that grows with speed
  const vib = clamp(kmh / 300) * (0.4 + 0.6 * clamp(wSm / 30));
  carObj.rig.children[0].position.y = (Math.sin(now * 0.052) + Math.sin(now * 0.0337) * 0.7) * 0.0018 * vib;
  rig.position.copy(a.p); rig.rotation.set(0, a.yaw, 0);
  const brake = sstep(2.75, 3.0, c) * (1 - sstep(3.3, 3.45, c));
  rig.rotation.z = -steer * 0.05; // roll
  rig.rotation.x = 0;
  const pitch = -brake * 0.012; carObj.rig.children[0].rotation.z = pitch; // nose dive about local z

  // phase variables
  const night = sstep(3.1, 3.85, c), ov = sstep(4.55, 4.98, c);
  const sp = SPEED_AT(c), live = 0.45 + 0.55 * clamp(Math.abs(vS) / 0.5 + (forced !== undefined ? 1 : 0));
  kmh = lerp(kmh, sp * live, 1 - Math.exp(-dt * 8));
  drive.update(kmh, dt, vS, brake);
  if (crankT >= 0) { crankT += dt; const q = crankT; drive.rpm = q < 1.1 ? 0.03 + 0.2 * (q / 1.1) : q < 1.5 ? 0.23 + 0.5 * Math.sin(((q - 1.1) / 0.4) * Math.PI * 0.5) : 0.73 - 0.62 * sstep(1.5, 2.6, q); drive.thr = q > 1.1 && q < 1.6 ? 0.9 : 0.05; if (q > 2.7) crankT = -1; }
  else if (flare > 0) { flare = Math.max(0, flare - dt * 1.6); drive.rpm += 0.32 * Math.sin(flare * Math.PI); drive.thr = Math.max(drive.thr, 0.8 * flare); }
  audio.update(drive, dt, brake, clamp(kmh / 320));
  // lap timer: starts once you pull away from the grid, stops at the flag
  if (entered && forced === undefined) {
    if (lapT0 < 0 && c > 0.5) { lapT0 = now; lapDone = false; }
    if (lapT0 >= 0 && !lapDone && c > 4.93) { lapDone = true; const ms = now - lapT0, mm_ = Math.floor(ms / 60000), ss = Math.floor((ms % 60000) / 1000), mls = Math.floor(ms % 1000); $('#laptime').textContent = `${mm_}:${String(ss).padStart(2, '0')}.${String(mls).padStart(3, '0')}`; }
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
  const W = innerWidth, Hh = innerHeight, sh = mob ? 0 : shx * (1 - ov * 0.0);
  camera.setViewOffset(W, Hh, -sh * W, mob ? 0.2 * Hh : 0, W, Hh);

  // environment / light
  const fogC = new THREE.Color().lerpColors(new THREE.Color(0x2a1c16), new THREE.Color(0x06080d), night);
  scene.fog.color.copy(fogC); scene.fog.density = lerp(0.0042, 0.0013, night) * lerp(1, 0.05, ov);
  scene.background = fogC;
  const U = worldObj.skyMat.uniforms; U.uHor.value.lerpColors(new THREE.Color(0x4a2c1c), new THREE.Color(0x0a0e18), night); U.uNight.value = night;
  worldObj.sky.position.copy(camera.position);
  scene.userData.key.intensity = lerp(2.6, 0.35, night); scene.userData.hemi.intensity = lerp(0.35, 0.28, night);
  for (const m of envMats) m.envMapIntensity = m._e0 * lerp(1, 0.5, night);
  renderer.toneMappingExposure = lerp(1.0, 1.15, night) * (1 - ov * 0.25);
  spots.forEach((s) => { s.intensity = lerp(8, 220, night); });
  tail.intensity = lerp(0.4, 1.6, night) + brake * 3;
  trackObj.mat.opacity = lerp(0.86, 0.94, ov);
  trackObj.gantry.update(u, night); sceneryObj.update(night);
  carObj.lights.forEach((m) => { if (m.emissiveIntensity !== undefined) m.emissiveIntensity = lerp(1, 4, night); });

  // brakes + sparks
  const hot = 3.6 * sstep(2.7, 3.05, c) * (1 - sstep(3.45, 4.3, c)) + 0.0;
  carObj.disc.forEach((m) => { m.emissiveIntensity = hot; }); carObj.heatMat.opacity = clamp(hot / 3.2) * bl * 0.5;
  if (brake > 0.2 && Math.abs(dU) > 1e-6) {
    const n = Math.min(6, Math.floor(Math.abs(dU) * LENGTH * 2.2) + 1);
    const fwd = tmpV.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
    for (const wz of [-0.86, 0.86]) {
      const p = new THREE.Vector3(1.4, 0.15, wz).applyAxisAngle(UP, a.yaw).add(a.p);
      sparks.userData.emit(p, new THREE.Vector3(-fwd.x * 4, 0, -fwd.z * 4).multiplyScalar(Math.sign(dU) || 1), n, 3.4);
    }
  }
  sparks.userData.update(dt);

  // streamlines
  const sAmt = sstep(1.6, 2.05, c) * (1 - sstep(2.7, 3.0, c));
  smoke.visible = sAmt > 0.01; if (smoke.visible) smoke.userData.update(dt, sAmt, 0.8 + clamp(Math.abs(vS) * 3, 0, 4), renderer.domElement.height * 0.5 / Math.tan((camera.fov * Math.PI) / 360));
  streams.visible = sAmt > 0.01; streams.material.uniforms.uA.value = sAmt; streams.material.uniforms.uT.value += dt * (0.5 + clamp(Math.abs(vS) * 3, 0, 4));

  // warp streaks
  const sp01 = clamp(kmh / 320), wAmt = sstep(0.25, 0.6, sp01) * (1 - ov) * (c > 1 ? 1 : 0);
  warp.visible = wAmt > 0.01;
  if (warp.visible) warp.userData.update(a.p, a.t, tmpV.set(-a.t.z, 0, a.t.x).clone(), wAmt, dt, 40 + kmh * 0.4);
  warp.material.opacity = wAmt;
  post.uniforms.uWarp.value = sstep(0.55, 1, sp01) * (1 - ov) * clamp(Math.abs(vS) * 1.6 + (forced !== undefined ? 0.4 : 0), 0, 1);
  post.uniforms.uCA.value = 0.0005 + clamp(Math.abs(vS), 0, 2) * 0.0009;
  post.uniforms.uT.value = (now % 1000) / 1000;
  post.uniforms.uFade.value = 0;
  bloom.strength = lerp(0.42, 0.75, night) * (1 - ov * 0.78); bloom.threshold = lerp(0.88, 1.1, ov);

  // start lights
  const lt = rt - 1.0;
  startL.set(c > 0.14 ? 0 : lt < 0 ? 0 : lt < 2.5 ? Math.min(5, Math.floor(lt / 0.5) + 1) : lt < 3.4 ? 5 : 0);

  // racing line trail + finish burst
  const prog = clamp(u / 0.985);
  line.geometry.setDrawRange(0, Math.floor(prog * line.userData.N) * 6);
  line.material.uniforms.uA.value = lerp(0.55, 0.5, ov); line.material.uniforms.uW.value = lerp(0.7, 12, ov);
  if (c > 4.93 && !finishFired) {
    finishFired = true; const p = at(0.0).p;
    for (let i = 0; i < 6; i++) sparks.userData.emit(new THREE.Vector3(p.x, 9, p.z), new THREE.Vector3(0, 12, 0), 40, 16);
  } else if (c < 4.8) finishFired = false;

  ui.update({ c, dt, mob, now, u, kmh, drive, vS, mm, at, prog });
  composer.render(dt);
  frames++; window.__frames = frames;
}

boot().then(() => requestAnimationFrame(frame)).catch((e) => { console.error(e); document.body.classList.add('nogl'); loaderEl.classList.add('done'); });
window.__dbg = { get c() { return S; } };
