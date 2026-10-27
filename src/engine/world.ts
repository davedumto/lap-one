import * as THREE from 'three';
import { at, TRACK_W, curve } from './track';

export interface WorldObject {
  sky: THREE.Mesh;
  skyMat: THREE.ShaderMaterial;
  ground: THREE.Mesh;
}

export function buildWorld(scene: THREE.Scene): WorldObject {
  // sky dome: dusk horizon -> night, controlled by uniforms
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color(0x05070d) }, uHor: { value: new THREE.Color(0x3a2418) }, uGlow: { value: new THREE.Color(0xff7a3a) }, uNight: { value: 0 }, uSun: { value: new THREE.Vector3(1, 0.05, 0.2).normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 vD; uniform vec3 uTop,uHor,uGlow,uSun; uniform float uNight;
      void main(){ float h = clamp(vD.y,0.,1.); vec3 c = mix(uHor, uTop, pow(h,.55));
        float s = pow(max(dot(vD,uSun),0.),6.); c += uGlow * s * (1.-uNight*.85) * .55;
        c += uGlow * exp(-abs(vD.y)*14.) * .22 * (1.-uNight*.6);
        gl_FragColor = vec4(c,1.); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), skyMat); sky.renderOrder = -10; scene.add(sky);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x0b0d11, roughness: 1, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -3.2; scene.add(ground);

  // barriers: two vertical ribbons
  const half = TRACK_W / 2 + 3.2, N = 700;
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a7d84, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const P: number[] = [], I: number[] = [];
    for (let i = 0; i <= N; i++) {
      const a = at(i / N), r = new THREE.Vector3(-a.t.z, 0, a.t.x);
      const x = a.p.x + r.x * half * s, z = a.p.z + r.z * half * s;
      P.push(x, 0.0, z, x, 0.9, z);
      if (i < N) { const k = i * 2; I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, mat));
  }

  // scattered trackside rocks / blocks for parallax
  const n = 700, im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.9, metalness: 0.1 }), n);
  const d = new THREE.Object3D(); let k = 0, guard = 0;
  const SAMP: THREE.Vector3[] = []; for (let j = 0; j < 260; j++) SAMP.push(curve.getPointAt(j / 260));
  while (k < n && guard++ < n * 6) {
    const a = at(Math.random()), r = new THREE.Vector3(-a.t.z, 0, a.t.x);
    const off = (120 + Math.pow(Math.random(), 1.3) * 260) * (Math.random() < 0.5 ? -1 : 1);
    const x = a.p.x + r.x * off, z = a.p.z + r.z * off;
    // reject near other parts of the track
    let ok = true;
    for (let j = 0; j < SAMP.length; j++) { const dx = SAMP[j].x - x, dz = SAMP[j].z - z; if (dx * dx + dz * dz < 18 * 18) { ok = false; break; } }
    if (!ok) continue;
    const sx = 0.6 + Math.random() * 3.2, sy = 0.4 + Math.random() * (Math.random() < 0.08 ? 14 : 2.4), sz = 0.6 + Math.random() * 3.2;
    d.position.set(x, sy / 2 - 3.2 + Math.random() * 1.6, z); d.rotation.set(0, Math.random() * 6.28, 0); d.scale.set(sx, sy + 3.2, sz); d.updateMatrix();
    im.setMatrixAt(k++, d.matrix);
  }
  im.count = k; scene.add(im);
  return { sky, skyMat, ground };
}
