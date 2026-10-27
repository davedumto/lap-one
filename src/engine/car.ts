import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export const WHEELS = [
  { name: 'wh0', c: new THREE.Vector3(1.40, 0.355, 0.86), front: true },
  { name: 'wh1', c: new THREE.Vector3(1.40, 0.355, -0.86), front: true },
  { name: 'wh2', c: new THREE.Vector3(-1.23, 0.36, 0.86), front: false },
  { name: 'wh3', c: new THREE.Vector3(-1.23, 0.36, -0.86), front: false },
];

export function loadCar(url: string, onProgress?: (ev: ProgressEvent) => void): Promise<THREE.Group> {
  return new Promise((res, rej) => {
    const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
    l.load(url, (g) => res(g.scene), onProgress, rej);
  });
}

const matName = (m: THREE.Mesh): string => ((Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material | undefined)?.name || '';

export function splitWheels(root: THREE.Object3D): THREE.Group[] {
  root.updateMatrixWorld(true);
  const targets: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh && /Tyre_Inst|Rim_Inst|Brake_Disc_Inst/i.test(matName(o as THREE.Mesh) + ' ' + o.name)) targets.push(o as THREE.Mesh); });
  const pivots = WHEELS.map((w) => { const g = new THREE.Group(); g.name = w.name; g.position.copy(w.c); g.rotation.order = 'YXZ'; root.add(g); return g; });
  const v = new THREE.Vector3(), tmp = new THREE.Matrix4();
  for (const m of targets) {
    const geo = m.geometry, pos = geo.attributes.position;
    const ix = geo.index ? geo.index.array : null, tri = ix ? ix.length / 3 : pos.count / 3;
    const buckets: number[][] = [[], [], [], []];
    for (let t = 0; t < tri; t++) {
      let cx = 0, cz = 0;
      for (let k = 0; k < 3; k++) { const i = ix ? ix[t * 3 + k] : t * 3 + k; v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m.matrixWorld); cx += v.x; cz += v.z; }
      cx /= 3; cz /= 3;
      let best = 0, bd = 1e9;
      for (let w = 0; w < 4; w++) { const d = (cx - WHEELS[w].c.x) ** 2 + (cz - WHEELS[w].c.z) ** 2; if (d < bd) { bd = d; best = w; } }
      const b = buckets[best];
      for (let k = 0; k < 3; k++) b.push(ix ? ix[t * 3 + k] : t * 3 + k);
    }
    for (let w = 0; w < 4; w++) {
      if (!buckets[w].length) continue;
      const g2 = new THREE.BufferGeometry();
      for (const k in geo.attributes) g2.setAttribute(k, geo.attributes[k]);
      g2.setIndex(new THREE.BufferAttribute(new Uint32Array(buckets[w]), 1));
      g2.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2); // generous; avoids bad culling
      const nm = new THREE.Mesh(g2, m.material);
      nm.matrixAutoUpdate = false;
      tmp.makeTranslation(-WHEELS[w].c.x, -WHEELS[w].c.y, -WHEELS[w].c.z);
      nm.matrix.copy(tmp).multiply(m.matrixWorld);
      nm.frustumCulled = false;
      pivots[w].add(nm);
    }
    m.visible = false;
  }
  return pivots;
}

export function makeEnv(renderer: THREE.WebGLRenderer): THREE.Texture {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ color: 0x07090d, side: THREE.BackSide })));
  const box = (w: number, h: number, x: number, y: number, z: number, c: number, I: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(I), side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  box(30, 6, 0, 30, 0, 0xffffff, 5);       // roof strip
  box(26, 3, -34, 8, 0, 0xcfe0ff, 6);      // cool key
  box(26, 3, 34, 8, -6, 0xffd9a8, 4);      // warm rim
  box(40, 3, 0, 5, -36, 0xffffff, 3);
  box(40, 3, 0, 5, 36, 0xffffff, 3);
  box(14, 14, 30, 14, 30, 0xff3a2a, 0.8);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02);
  pm.dispose();
  return rt.texture;
}

export interface CarRig {
  rig: THREE.Group;
  disc: THREE.MeshStandardMaterial[];
  lights: THREE.MeshStandardMaterial[];
  blurMat: THREE.MeshBasicMaterial;
  heatMat: THREE.MeshBasicMaterial;
  spin: (a: number, steer: number) => void;
}

export function buildRig(model: THREE.Group, _env: THREE.Texture): CarRig {
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      (o as THREE.Mesh).frustumCulled = false;
      const mesh = o as THREE.Mesh;
      const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      ms.forEach((m) => { if ((m as THREE.MeshStandardMaterial).envMapIntensity !== undefined) (m as THREE.MeshStandardMaterial).envMapIntensity = 1.25; });
    }
  });
  const pivots = splitWheels(model);
  // motion-blur discs: fade in with spin rate so fast wheels read as smooth blur, not strobing spokes
  const bc = document.createElement('canvas'); bc.width = bc.height = 256; const bx = bc.getContext('2d')!;
  const gr = bx.createRadialGradient(128, 128, 0, 128, 128, 128);
  ([[0, 'rgba(18,18,22,.95)'], [.17, 'rgba(18,18,22,.95)'], [.2, 'rgba(46,47,54,.9)'], [.56, 'rgba(40,41,48,.88)'], [.64, 'rgba(92,94,104,.75)'], [.69, 'rgba(26,27,32,.92)'], [.93, 'rgba(12,12,14,.95)'], [.985, 'rgba(12,12,14,0)']] as [number, string][]).forEach(([o, c]) => gr.addColorStop(o, c));
  bx.fillStyle = gr; bx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) { bx.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.05})`; bx.beginPath(); bx.arc(128, 128, 30 + Math.random() * 90, Math.random() * 6.28, Math.random() * 6.28); bx.stroke(); }
  const blurMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true });
  blurMat.map!.colorSpace = THREE.SRGBColorSpace;
  const hc = document.createElement('canvas'); hc.width = hc.height = 128; const hx = hc.getContext('2d')!;
  const hg = hx.createRadialGradient(64, 64, 0, 64, 64, 64);
  ([[0, 'rgba(0,0,0,0)'], [.3, 'rgba(0,0,0,0)'], [.42, 'rgba(255,120,40,.9)'], [.62, 'rgba(255,90,20,.95)'], [.8, 'rgba(255,60,10,.3)'], [1, 'rgba(0,0,0,0)']] as [number, string][]).forEach(([o, c]) => hg.addColorStop(o, c));
  hx.fillStyle = hg; hx.fillRect(0, 0, 128, 128);
  const heatMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  WHEELS.forEach((w, i) => {
    const hd = new THREE.Mesh(new THREE.CircleGeometry(0.3, 40), heatMat); hd.position.z = Math.sign(w.c.z) * 0.172; if (w.c.z < 0) hd.rotation.y = Math.PI; hd.renderOrder = 6; hd.frustumCulled = false; pivots[i].add(hd);
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.335, 48), blurMat);
    d.position.z = Math.sign(w.c.z) * 0.165; if (w.c.z < 0) d.rotation.y = Math.PI;
    d.renderOrder = 5; d.frustumCulled = false; pivots[i].add(d);
  });
  const rig = new THREE.Group();
  rig.add(model);
  const mirror = model.clone(true);
  mirror.scale.y = -1;
  rig.add(mirror);
  const mPivots = WHEELS.map((w) => mirror.getObjectByName(w.name) as THREE.Group | null);
  // emissive bits
  const disc: THREE.MeshStandardMaterial[] = []; const lights: THREE.MeshStandardMaterial[] = [];
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material) {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (/Brake_Disc/i.test(m.name) && !disc.includes(m)) disc.push(m);
      if (/Interactive_Lights/i.test(m.name) && !lights.includes(m)) lights.push(m);
    }
  });
  disc.forEach((m) => { m.emissive = new THREE.Color(0xff5a1a); m.emissiveIntensity = 0; });
  return {
    rig, disc, lights, blurMat, heatMat,
    spin(a: number, steer: number) {
      for (let i = 0; i < 4; i++) {
        for (const p of [pivots[i], mPivots[i]]) { if (!p) continue; p.rotation.z = -a; p.rotation.y = WHEELS[i].front ? steer : 0; }
      }
    },
  };
}
