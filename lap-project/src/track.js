import * as THREE from 'three';

const PTS = [[0,0],[90,-6],[190,-34],[280,-26],[335,34],[322,112],[268,166],[205,186],[172,240],[190,306],[146,360],[60,350],[4,296],[-18,222],[-74,180],[-66,100],[-24,44]];
export const TRACK_W = 12;
const K = 1.5;
export const curve = new THREE.CatmullRomCurve3(PTS.map(([x, z]) => new THREE.Vector3(x * K, 0, z * K)), true, 'centripetal');
curve.arcLengthDivisions = 1500;
export const LENGTH = curve.getLength();

const _p = new THREE.Vector3(), _t = new THREE.Vector3();
export function at(u) {
  u = ((u % 1) + 1) % 1;
  curve.getPointAt(u, _p); curve.getTangentAt(u, _t);
  return { p: _p.clone(), t: _t.clone(), yaw: Math.atan2(-_t.z, _t.x) };
}

export function buildTrack(scene) {
  const N = 900, pos = [], uv = [], idx = [];
  const half = TRACK_W / 2;
  for (let i = 0; i <= N; i++) {
    const u = i / N, a = at(u), r = new THREE.Vector3(-a.t.z, 0, a.t.x);
    for (const s of [-1, 1]) { pos.push(a.p.x + r.x * half * s, 0, a.p.z + r.z * half * s); uv.push(s * 0.5 + 0.5, u * LENGTH / 6); }
    if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // asphalt with subtle procedural texture
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); x.fillStyle = '#26282d'; x.fillRect(0, 0, 256, 256);
  const im = x.getImageData(0, 0, 256, 256);
  for (let i = 0; i < im.data.length; i += 4) { const n = (Math.random() - 0.5) * 26; im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n; }
  x.putImageData(im, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0x9a9da4, roughness: 0.42, metalness: 0.15, transparent: true, opacity: 0.86, depthWrite: true });
  const road = new THREE.Mesh(g, mat); road.renderOrder = 2; scene.add(road);

  // edge lines + centre dashes via thin ribbons (emissive white)
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xdfe3ea, transparent: true, opacity: 0.9, fog: true });
  function strip(off, w, dash) {
    const P = [], I = []; let vi = 0;
    const steps = dash ? Math.floor(LENGTH / 9) : 900;
    for (let i = 0; i < steps; i++) {
      const u0 = i / steps, u1 = dash ? u0 + 4.2 / LENGTH : (i + 1) / steps;
      const a = at(u0), b = at(u1);
      const ra = new THREE.Vector3(-a.t.z, 0, a.t.x), rb = new THREE.Vector3(-b.t.z, 0, b.t.x);
      for (const [q, rr] of [[a, ra], [b, rb]]) for (const s of [-1, 1]) P.push(q.p.x + rr.x * (off + s * w / 2), 0.012, q.p.z + rr.z * (off + s * w / 2));
      I.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2); vi += 4;
    }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); gg.setIndex(I);
    const m = new THREE.Mesh(gg, lineMat); m.renderOrder = 3; scene.add(m);
  }
  strip(half - 0.45, 0.26, false); strip(-half + 0.45, 0.26, false); strip(0, 0.22, true);

  // kerb-ish edge posts with warm lights (instanced)
  const postN = Math.floor(LENGTH / 14);
  const pg = new THREE.BoxGeometry(0.16, 0.9, 0.16);
  const pm = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  const posts = new THREE.InstancedMesh(pg, pm, postN * 2);
  const d = new THREE.Object3D(); let n = 0;
  for (let i = 0; i < postN; i++) {
    const a = at(i / postN), r = new THREE.Vector3(-a.t.z, 0, a.t.x);
    for (const s of [-1, 1]) { d.position.set(a.p.x + r.x * (half + 1.6) * s, 0.45, a.p.z + r.z * (half + 1.6) * s); d.updateMatrix(); posts.setMatrixAt(n++, d.matrix); }
  }
  scene.add(posts);

  // gantries along the lap (arches), instanced pillar/beam + emissive bar, pulsing by progress
  const gN = 34, gMat = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6, metalness: 0.5 });
  const pillar = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 9, 0.5), gMat, gN * 2);
  const beam = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.6, TRACK_W + 4), gMat, gN);
  const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const bar = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.16, TRACK_W + 3.6), barMat, gN);
  bar.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(gN * 3), 3);
  const gU = [];
  const q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < gN; i++) {
    const u = 0.02 + (i / gN) * 0.96; gU.push(u);
    const a = at(u), r = new THREE.Vector3(-a.t.z, 0, a.t.x);
    q.setFromAxisAngle(up, a.yaw);
    for (const s of [-1, 1]) { d.position.set(a.p.x + r.x * (half + 2) * s, 4.5, a.p.z + r.z * (half + 2) * s); d.quaternion.copy(q); d.scale.set(1, 1, 1); d.updateMatrix(); pillar.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), d.matrix); }
    d.position.set(a.p.x, 9, a.p.z); d.updateMatrix(); beam.setMatrixAt(i, d.matrix);
    d.position.set(a.p.x - a.t.x * 0.36, 8.62, a.p.z - a.t.z * 0.36); d.updateMatrix(); bar.setMatrixAt(i, d.matrix);
  }
  d.quaternion.identity();
  scene.add(pillar, beam, bar);
  const gantry = { bar, gU, n: gN };
  const col = new THREE.Color();
  gantry.update = (carU, nightAmt) => {
    for (let i = 0; i < gN; i++) {
      let du = gU[i] - carU; du -= Math.round(du);
      const w = Math.exp(-Math.pow((du * LENGTH + 20) / 28, 2)); // light up just behind & around the car
      const base = 0.06 + 0.5 * nightAmt;
      const v = base + w * 3.2;
      col.setRGB(v * 1.0, v * 0.86, v * 0.5);
      bar.setColorAt(i, col);
    }
    bar.instanceColor.needsUpdate = true;
  };

  // start/finish line decal (checker)
  const cc = document.createElement('canvas'); cc.width = 256; cc.height = 64; const cx = cc.getContext('2d');
  for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { cx.fillStyle = (i + j) % 2 ? '#fff' : '#111'; cx.fillRect(i * 16, j * 16, 16, 16); }
  const ct = new THREE.CanvasTexture(cc); ct.colorSpace = THREE.SRGBColorSpace; ct.magFilter = THREE.NearestFilter;
  const sf = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W - 1, 2.4), new THREE.MeshBasicMaterial({ map: ct }));
  const s0 = at(0);
  sf.rotation.order = 'YXZ'; sf.rotation.set(-Math.PI / 2, s0.yaw - Math.PI / 2, 0);
  sf.position.set(s0.p.x, 0.02, s0.p.z); sf.renderOrder = 3; scene.add(sf);

  return { road, gantry, mat };
}

export function minimapPath(size = 120, pad = 10) {
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; const P = [];
  for (let i = 0; i < 220; i++) { const a = at(i / 220); P.push(a.p); minX = Math.min(minX, a.p.x); maxX = Math.max(maxX, a.p.x); minZ = Math.min(minZ, a.p.z); maxZ = Math.max(maxZ, a.p.z); }
  const s = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  const ox = (size - (maxX - minX) * s) / 2, oz = (size - (maxZ - minZ) * s) / 2;
  const map = (p) => [(p.x - minX) * s + ox, (p.z - minZ) * s + oz];
  const d = P.map((p, i) => { const [x, y] = map(p); return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }).join('') + 'Z';
  return { d, map, bounds: { minX, maxX, minZ, maxZ } };
}
