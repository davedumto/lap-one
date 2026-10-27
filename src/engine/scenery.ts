import * as THREE from 'three';
import { at, TRACK_W, LENGTH } from './track';

const HALF = TRACK_W / 2;
const rightOf = (a: { t: THREE.Vector3 }) => new THREE.Vector3(-a.t.z, 0, a.t.x);
const mkCanvas = (w: number, h: number, fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
};

type Seg = [number, number, number, number, number];

function ribbonFrom(segs: Seg[], y: number): THREE.BufferGeometry {
  // segs: array of [u0,u1,s,offA,offB]; builds quads between offA..offB on side s with uv along length
  const P: number[] = [], UV: number[] = [], I: number[] = []; let vi = 0, run = 0;
  for (const [u0, u1, s, a, b] of segs) {
    const A = at(u0), B = at(u1), ra = rightOf(A), rb = rightOf(B);
    const len = (u1 - u0) * LENGTH;
    for (const [q, r, t] of [[A, ra, run], [B, rb, run + len]] as const) { P.push(q.p.x + r.x * a * s, y, q.p.z + r.z * a * s, q.p.x + r.x * b * s, y, q.p.z + r.z * b * s); UV.push(0, t, 1, t); }
    run += len; I.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2); vi += 4;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals();
  return g;
}

export interface SceneryObject {
  update: (n: number) => void;
}

export function buildScenery(scene: THREE.Scene, roadGeo: THREE.BufferGeometry): SceneryObject {
  const night = { v: 0 }, hooks: ((n: number) => void)[] = [];

  // --- stencil hole: the road area is excluded from the land so the mirror car shows through the asphalt
  const sten = new THREE.Mesh(roadGeo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }));
  sten.renderOrder = -20; sten.frustumCulled = false; scene.add(sten);
  const landTex = mkCanvas(512, 512, (x, w, h) => {
    x.fillStyle = '#1d2618'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const g = 20 + Math.random() * 40; x.fillStyle = `rgba(${g * 0.8},${g + 18},${g * 0.5},${0.15 + Math.random() * 0.3})`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 5); }
  });
  landTex.repeat.set(700, 700);
  const land = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), new THREE.MeshStandardMaterial({ map: landTex, color: 0xb8c0b0, roughness: 1, metalness: 0, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc }));
  land.rotation.x = -Math.PI / 2; land.position.y = -0.04; land.renderOrder = -10; scene.add(land);

  // --- corner analysis
  const N = 900, dy: number[] = [];
  for (let i = 0; i < N; i++) { const a = at(i / N), b = at(i / N + 10 / LENGTH); let d = b.yaw - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); dy.push(d); }
  const gravel: Seg[] = [], kerb: Seg[] = []; const tyres: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const d = dy[i], ad = Math.abs(d); if (ad < 0.06) continue;
    const out = d > 0 ? 1 : -1;               // outside of a left turn is the right side
    const u0 = i / N, u1 = (i + 1) / N;
    gravel.push([u0, u1, out, HALF + 1.1, HALF + 3.0]);
    kerb.push([u0, u1, out, HALF - 0.05, HALF + 1.05]);
    if (ad > 0.04) kerb.push([u0, u1, -out, HALF - 0.05, HALF + 1.05]);
    if (i % 2 === 0 && ad > 0.1) tyres.push([u0, out]);
  }
  if (gravel.length) {
    const gt = mkCanvas(128, 128, (x, w, h) => { x.fillStyle = '#9a9384'; x.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const g = 100 + Math.random() * 110; x.fillStyle = `rgb(${g},${g - 6},${g - 20})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
    gt.repeat.set(1, 0.3);
    const gm = new THREE.Mesh(ribbonFrom(gravel, 0.0), new THREE.MeshStandardMaterial({ map: gt, color: 0x9d9686, roughness: 1 }));
    gm.renderOrder = 1; scene.add(gm);
  }
  if (kerb.length) {
    const kt = mkCanvas(64, 128, (x, w, h) => { for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#f2f2ee' : '#d1342b'; x.fillRect(0, i * 32, w, 32); } });
    kt.repeat.set(1, 1 / 4);  // uv.y is metres: one stripe pair per 4 m
    const km = new THREE.Mesh(ribbonFrom(kerb, 0.03), new THREE.MeshStandardMaterial({ map: kt, roughness: 0.7, metalness: 0 }));
    km.renderOrder = 3; scene.add(km);
  }

  // --- tyre walls on the outside of tight corners
  if (tyres.length) {
    const g = new THREE.CylinderGeometry(0.46, 0.46, 0.42, 14);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const n = tyres.length * 3, im = new THREE.InstancedMesh(g, mat, n), d = new THREE.Object3D(), col = new THREE.Color(); let k = 0;
    for (const [u, out] of tyres) {
      const a = at(u), r = rightOf(a);
      for (let h = 0; h < 3; h++) { d.position.set(a.p.x + r.x * (HALF + 4.1) * out, 0.21 + h * 0.43, a.p.z + r.z * (HALF + 4.1) * out); d.rotation.set(0, 0, 0); d.updateMatrix(); im.setMatrixAt(k, d.matrix); col.set(Math.floor(u * N / 4 + h) % 5 === 0 ? 0xcfcfca : 0x15161a); im.setColorAt(k++, col); }
    }
    scene.add(im);
  }

  // --- rubber line + brake skids
  {
    const P: number[] = [], C: number[] = [], I: number[] = []; let vi = 0;
    const strip = (u0: number, u1: number, off: number, w: number, steps: number, alpha: number, fade: boolean) => {
      for (let i = 0; i < steps; i++) {
        const ua = u0 + (u1 - u0) * (i / steps), ub = u0 + (u1 - u0) * ((i + 1) / steps), A = at(ua), B = at(ub);
        for (const [q, uu] of [[A, i / steps], [B, (i + 1) / steps]] as const) {
          const r = rightOf(q), al = alpha * (fade ? Math.sin(Math.PI * uu) ** 0.6 : 1);
          for (const s of [-1, 1]) { P.push(q.p.x + r.x * (off + s * w / 2), 0.02, q.p.z + r.z * (off + s * w / 2)); C.push(0, 0, 0, al); }
        }
        I.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2); vi += 4;
      }
    };
    strip(0, 1, 0, 3.2, 700, 0.2, false);
    for (const o of [-0.95, -0.55, 0.55, 0.95]) strip(0.146, 0.176, o, 0.2, 40, 0.5, true);
    for (const o of [-1.2, 1.2]) strip(0.36, 0.40, o, 0.16, 40, 0.36, true);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4)); g.setIndex(I);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false })); m.renderOrder = 3; scene.add(m);
  }

  // --- sodium lamp posts with light pools on the asphalt
  {
    const n = Math.floor(LENGTH / 52), pole = new THREE.MeshStandardMaterial({ color: 0x2a2d34, roughness: 0.55, metalness: 0.7 });
    const lamp = new THREE.MeshBasicMaterial({ color: 0xffc27a, toneMapped: false });
    const poolTex = mkCanvas(128, 128, (x, w, h) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,196,120,1)'); g.addColorStop(0.35, 'rgba(255,170,90,0.45)'); g.addColorStop(1, 'rgba(255,150,70,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    hooks.push((nn: number) => { lamp.color.set(0xffc27a).multiplyScalar(0.5 + 3.2 * nn); poolMat.opacity = 0.05 + 0.5 * nn; });
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 11, 8), pole, n);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 3.4), pole, n);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.16, 0.45), lamp, n);
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(19, 19), poolMat, n);
    const d = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const a = at((i + 0.5) / n), r = rightOf(a), s = i % 2 ? 1 : -1, off = HALF + 6.5;
      const x = a.p.x + r.x * off * s, z = a.p.z + r.z * off * s;
      d.rotation.set(0, a.yaw, 0); d.scale.set(1, 1, 1);
      d.position.set(x, 5.5, z); d.updateMatrix(); poles.setMatrixAt(i, d.matrix);
      d.position.set(x - r.x * s * 1.7, 11, z - r.z * s * 1.7); d.updateMatrix(); arms.setMatrixAt(i, d.matrix);
      d.position.set(x - r.x * s * 3.1, 10.88, z - r.z * s * 3.1); d.updateMatrix(); heads.setMatrixAt(i, d.matrix);
      d.rotation.set(-Math.PI / 2, 0, 0); d.position.set(x - r.x * s * 3.1, 0.06, z - r.z * s * 3.1); d.updateMatrix(); pools.setMatrixAt(i, d.matrix);
    }
    pools.renderOrder = 4; scene.add(poles, arms, heads, pools);
  }

  // --- catch fencing behind the barriers, both sides, whole lap
  {
    const tex = mkCanvas(64, 64, (x, w, h) => { x.clearRect(0, 0, w, h); x.strokeStyle = 'rgba(210,214,222,0.9)'; x.lineWidth = 1; for (let i = 0; i <= 64; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); } });
    tex.repeat.set(1, 1);
    const fm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.11, depthWrite: false, side: THREE.DoubleSide, fog: true });
    for (const side of [-1, 1]) {
      const P: number[] = [], UV: number[] = [], I: number[] = []; const N2 = 600;
      for (let i = 0; i <= N2; i++) { const a = at(i / N2), r = rightOf(a), o = HALF + 3.9, x = a.p.x + r.x * o * side, z = a.p.z + r.z * o * side; P.push(x, 0.9, z, x, 6.2, z); UV.push(i * (LENGTH / N2) / 4, 0, i * (LENGTH / N2) / 4, 1); if (i < N2) { const k = i * 2; I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I);
      const m = new THREE.Mesh(g, fm); m.renderOrder = 4; scene.add(m);
    }
    const pn = Math.floor(LENGTH / 8), posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 5.8, 0.1), new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: 0.6, metalness: 0.7 }), pn * 2), d = new THREE.Object3D();
    for (let i = 0; i < pn; i++) { const a = at(i / pn), r = rightOf(a); for (const s of [-1, 1]) { d.position.set(a.p.x + r.x * (HALF + 3.9) * s, 3.5, a.p.z + r.z * (HALF + 3.9) * s); d.updateMatrix(); posts.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), d.matrix); } }
    scene.add(posts);
  }

  // --- pedestrian bridges over the circuit
  {
    const concrete = new THREE.MeshStandardMaterial({ color: 0x4b4e55, roughness: 0.9 });
    const strip = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, toneMapped: false });
    hooks.push((nn: number) => { strip.color.set(0xdfe8ff).multiplyScalar(0.4 + 2.4 * nn); });
    for (const u of [0.275, 0.64, 0.83]) {
      const a = at(u), r = rightOf(a), W = TRACK_W + 16;
      const g = new THREE.Group(); g.position.copy(a.p); g.rotation.y = a.yaw;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(5, 1.3, W), concrete); deck.position.y = 7.6; g.add(deck);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.0, W), concrete); rail.position.set(2.4, 8.7, 0); const rail2 = rail.clone(); rail2.position.x = -2.4; g.add(rail, rail2);
      const under = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, W - 1), strip); under.position.y = 6.92; g.add(under);
      for (const s of [-1, 1]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(2.2, 8, 2.2), concrete); pl.position.set(0, 4, s * (HALF + 6)); g.add(pl); }
      scene.add(g);
    }
  }

  // --- floodlight towers with faint volumetric cones
  {
    const n = 34, pole = new THREE.MeshStandardMaterial({ color: 0x20232a, roughness: 0.6, metalness: 0.6 });
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2d8).multiplyScalar(4), toneMapped: false });
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xffe9bf, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    hooks.push((nn: number) => { lampMat.color.set(0xfff2d8).multiplyScalar(0.7 + 4 * nn); coneMat.opacity = 0; });
    const cg = new THREE.ConeGeometry(14, 30, 24, 1, true); cg.translate(0, -15, 0);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.35) / n, a = at(u), r = rightOf(a), s = i % 2 ? 1 : -1, off = HALF + 22 + (i % 3) * 5;
      const x = a.p.x + r.x * off * s, z = a.p.z + r.z * off * s;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 30, 8), pole); p.position.set(x, 15, z); scene.add(p);
      const l = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.7, 2.2), lampMat); l.position.set(x, 30.3, z); l.rotation.y = a.yaw; scene.add(l);
      const c = new THREE.Mesh(cg, coneMat); c.position.set(x - r.x * s * 2, 30, z - r.z * s * 2); c.rotation.z = 0; scene.add(c);
    }
  }

  return { update(n: number) { if (Math.abs(n - night.v) > 0.003) { night.v = n; hooks.forEach((h) => h(n)); } } };
}
