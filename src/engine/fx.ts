import * as THREE from 'three';
import { at, TRACK_W } from './track';

// ---- wind tunnel streamlines (car-local space, +x forward; air flows toward -x)
const HX: [number, number][] = [[-2.4, .45], [-2.1, 1.25], [-1.5, 1.0], [-0.7, 1.0], [0.1, 1.12], [0.9, .88], [1.7, .55], [2.45, .22]];
function hAt(x: number): number {
  if (x <= HX[0][0]) return HX[0][1]; if (x >= HX[HX.length - 1][0]) return HX[HX.length - 1][1];
  let i = 0; while (x > HX[i + 1][0]) i++;
  const t = (x - HX[i][0]) / (HX[i + 1][0] - HX[i][0]), s = t * t * (3 - 2 * t);
  return HX[i][1] + (HX[i + 1][1] - HX[i][1]) * s;
}

export interface StreamLines extends THREE.LineSegments {
  material: THREE.ShaderMaterial;
  userData: { paths: number[][][]; M: number };
}

export function buildStreams(): StreamLines {
  const L = 85, M = 90, paths: number[][][] = [], pos: number[] = [], sA: number[] = [], seedA: number[] = [];
  for (let l = 0; l < L; l++) {
    const z0 = (Math.random() - 0.5) * 2.4, y0 = 0.12 + Math.pow(Math.random(), 0.9) * 1.5;
    const wz = Math.abs(z0), inCar = Math.exp(-Math.pow(wz / 1.0, 4));
    const seed = Math.random();
    const pts: number[][] = [];
    for (let i = 0; i < M; i++) {
      const x = 7 - (i / (M - 1)) * 15; // 7 -> -8
      // smoothed obstacle height over x, lifted a bit upstream
      let h = 0; for (let k = -3; k <= 3; k++) h = Math.max(h, hAt(x + k * 0.22) - Math.abs(k) * 0.03);
      h = (h + 0.05) * inCar;
      const lift = Math.max(0, h - y0 * 0.92);
      const yy = y0 + lift * 1.0 + Math.max(0, hAt(x - 1.2) * inCar - y0) * 0.0; // simple deflection
      const dz = Math.sign(z0 || 1) * (1 - inCar) * 0.0 + Math.sign(z0 || 1) * Math.max(0, hAt(x) * inCar - 0.0) * 0.12 * Math.exp(-Math.pow((y0 - 0.5) / 0.9, 2));
      // turbulence tail behind the wing
      const tail = Math.max(0, -x - 2.2), turb = Math.sin(tail * 1.7 + seed * 40) * 0.07 * tail * inCar;
      pts.push([x, yy + turb, z0 + dz + Math.cos(tail * 1.3 + seed * 20) * 0.05 * tail * inCar]);
    }
    paths.push(pts);
    for (let i = 0; i < M - 1; i++) {
      pos.push(...pts[i], ...pts[i + 1]);
      sA.push(i / (M - 1), (i + 1) / (M - 1)); seedA.push(seed, seed);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(sA, 1));
  g.setAttribute('aR', new THREE.Float32BufferAttribute(seedA, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uSpeed: { value: 1 } },
    vertexShader: 'attribute float aS, aR; varying float vS, vR; void main(){ vS=aS; vR=aR; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying float vS, vR; uniform float uT,uA,uSpeed;
      void main(){ float ph = fract(vS*3.2 - uT*(0.7+vR*0.6)*uSpeed + vR*7.);
        float dash = smoothstep(0.0,.12,ph)*(1.-smoothstep(.34,.5,ph));
        float fade = smoothstep(0.,.1,vS)*(1.-smoothstep(.85,1.,vS));
        vec3 c = mix(vec3(.55,.8,1.), vec3(1.,.82,.3), step(.72,vR));
        gl_FragColor = vec4(c*1.15, dash*fade*uA*.75); }`,
  });
  const lines = new THREE.LineSegments(g, mat) as unknown as StreamLines; lines.frustumCulled = false; lines.visible = false; lines.userData = { paths, M };
  return lines;
}

export interface WarpLines extends THREE.LineSegments {
  material: THREE.LineBasicMaterial;
  userData: { update: (carP: THREE.Vector3, t: THREE.Vector3, r: THREE.Vector3, speed01: number, dt: number, v: number) => void };
}

// ---- speed streaks that live around the car in world space
export function buildWarp(): WarpLines {
  const N = 260, pos = new Float32Array(N * 6), col = new Float32Array(N * 6);
  const st = Array.from({ length: N }, () => ({ a: (Math.random() - 0.5) * 220, l: (Math.random() < 0.5 ? -1 : 1) * (TRACK_W / 2 + 1.5 + Math.random() * 26), h: 0.2 + Math.pow(Math.random(), 2) * 16, k: 0.5 + Math.random() }));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 1, fog: false })) as unknown as WarpLines;
  m.frustumCulled = false; m.visible = false;
  const tmp = new THREE.Color();
  m.userData = {
    update: (carP: THREE.Vector3, t: THREE.Vector3, r: THREE.Vector3, speed01: number, dt: number, v: number) => {
      // v: world speed (m/s) of the car; streaks recede at that speed
      const len = 2 + speed01 * 38;
      for (let i = 0; i < N; i++) {
        const s = st[i]; s.a -= v * dt * s.k * 0.92; if (s.a < -120) s.a += 240;
        const x = carP.x + t.x * s.a + r.x * s.l, z = carP.z + t.z * s.a + r.z * s.l;
        pos.set([x, s.h, z, x - t.x * len * s.k, s.h, z - t.z * len * s.k], i * 6);
        const f = Math.max(0, 1 - Math.abs(s.a) / 120) * speed01;
        tmp.setRGB(1.0 * f, 0.82 * f, 0.45 * f);
        col.set([tmp.r, tmp.g, tmp.b, 0, 0, 0], i * 6);
      }
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    },
  };
  return m;
}

export interface SparkPoints extends THREE.Points {
  userData: {
    emit: (p: THREE.Vector3, v: THREE.Vector3, n: number, spread?: number) => void;
    update: (dt: number) => void;
  };
}

// ---- sparks
export function buildSparks(): SparkPoints {
  const N = 240, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), col = new Float32Array(N * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false })) as unknown as SparkPoints;
  m.frustumCulled = false; let head = 0;
  m.userData = {
    emit: (p: THREE.Vector3, v: THREE.Vector3, n: number, spread = 3) => {
      for (let i = 0; i < n; i++) {
        const k = head++ % N;
        pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
        vel[k * 3] = v.x + (Math.random() - 0.5) * spread; vel[k * 3 + 1] = Math.random() * spread * 0.9 + 0.5; vel[k * 3 + 2] = v.z + (Math.random() - 0.5) * spread;
        life[k] = 0.5 + Math.random() * 0.7;
      }
    },
    update: (dt: number) => {
      for (let k = 0; k < N; k++) {
        if (life[k] <= 0) { col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = 0; continue; }
        life[k] -= dt; vel[k * 3 + 1] -= 9 * dt;
        pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] = Math.max(0.02, pos[k * 3 + 1] + vel[k * 3 + 1] * dt); pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
        const f = Math.max(0, life[k]);
        col[k * 3] = 2.6 * f; col[k * 3 + 1] = 1.2 * f * f; col[k * 3 + 2] = 0.25 * f * f * f;
      }
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    },
  };
  return m;
}

export interface StartLights {
  grp: THREE.Group;
  set: (n: number) => void;
}

// ---- start gantry with 5 lights (at u ahead of the start line)
export function buildStartLights(scene: THREE.Scene): StartLights {
  const grp = new THREE.Group(), lamps: THREE.MeshBasicMaterial[] = [];
  const a = at(0.0095);
  grp.position.copy(a.p); grp.rotation.y = a.yaw;
  const dark = new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.6, metalness: 0.6 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 10.5, 0.6), dark); p.position.set(0, 5.25, s * (TRACK_W / 2 + 2.2)); grp.add(p); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, TRACK_W + 5), dark); beam.position.set(0, 10.2, 0); grp.add(beam);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0x220606, toneMapped: false });
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), m); l.position.set(-0.7, 10.2, (i - 2) * 1.55); grp.add(l); lamps.push(m);
  }
  scene.add(grp);
  const on = new THREE.Color(0xff1a10).multiplyScalar(5), off = new THREE.Color(0x220606);
  return { grp, set(n: number) { lamps.forEach((m, i) => m.color.copy(i < n ? on : off)); } };
}

export interface RacingLine extends THREE.Mesh {
  material: THREE.ShaderMaterial;
  userData: { N: number };
}

// ---- racing line ribbon, drawn behind the car
export function buildLine(): RacingLine {
  const N = 1200, P: number[] = [], R: number[] = [], Lt: number[] = [], I: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = at(i / N), r = [-a.t.z, 0, a.t.x];
    for (const s of [-1, 1]) { P.push(a.p.x, 0.045, a.p.z); R.push(...r); Lt.push(s); }
    if (i < N) { const k = i * 2; I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aR', new THREE.Float32BufferAttribute(R, 3)); g.setAttribute('aL', new THREE.Float32BufferAttribute(Lt, 1)); g.setIndex(I);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uW: { value: 0.9 }, uA: { value: 0.0 } },
    vertexShader: 'attribute vec3 aR; attribute float aL; uniform float uW; void main(){ vec3 p = position + aR*aL*uW*.5; gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.); }',
    fragmentShader: 'uniform float uA; void main(){ gl_FragColor = vec4(vec3(1.,.82,.25)*2.4*uA, uA); }',
  });
  const m = new THREE.Mesh(g, mat) as RacingLine; m.frustumCulled = false; m.renderOrder = 4;
  g.setDrawRange(0, 0);
  m.userData = { N };
  return m;
}

export interface SmokePoints extends THREE.Points {
  userData: { update: (dt: number, amt: number, flow: number, px: number) => void };
}

// ---- smoke wisps riding the same streamlines: soft sprites that drift, diffuse and fade (wind made visible)
export function buildSmoke(paths: number[][][], M: number): SmokePoints {
  const N = 1600, pos = new Float32Array(N * 3), al = new Float32Array(N), sz = new Float32Array(N);
  const P = Array.from({ length: N }, () => ({ k: (Math.random() * paths.length) | 0, s: Math.random(), sp: 0.05 + Math.random() * 0.08, seed: Math.random() * 100, j: [(Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12] }));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aA', new THREE.BufferAttribute(al, 1)); g.setAttribute('aS', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uPx: { value: 700 } },
    vertexShader: 'attribute float aA, aS; varying float vA; uniform float uPx; void main(){ vA=aA; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = aS*uPx/max(0.5,-mv.z); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'varying float vA; void main(){ vec2 d = gl_PointCoord-.5; float r = dot(d,d)*4.; float a = exp(-r*3.2)*(1.-smoothstep(.7,1.,r)); gl_FragColor = vec4(vec3(.86,.88,.92), a*vA); }',
  });
  const m = new THREE.Points(g, mat) as unknown as SmokePoints; m.frustumCulled = false; m.visible = false;
  let tm = 0;
  m.userData = {
    update: (dt: number, amt: number, flow: number, px: number) => {
      tm += dt; mat.uniforms.uPx.value = px;
      for (let i = 0; i < N; i++) {
        const p = P[i]; p.s += dt * p.sp * flow;
        if (p.s >= 1) { p.s -= 1; p.k = (Math.random() * paths.length) | 0; }
        const t = p.s * (M - 1), a = Math.floor(t), f = t - a, A = paths[p.k][a], B = paths[p.k][Math.min(M - 1, a + 1)];
        const sp = Math.pow(p.s, 1.3), w = 0.55 * sp + (A[0] < -2.2 ? Math.min(1.2, (-2.2 - A[0]) * 0.12) : 0);
        pos[i * 3] = A[0] + (B[0] - A[0]) * f + p.j[0];
        pos[i * 3 + 1] = A[1] + (B[1] - A[1]) * f + Math.sin(p.seed + tm * 0.9 + p.s * 7) * w * 0.5 + p.j[1];
        pos[i * 3 + 2] = A[2] + (B[2] - A[2]) * f + Math.cos(p.seed * 1.3 + tm * 0.7 + p.s * 6) * w * 0.5 + p.j[2];
        al[i] = (1 - Math.pow(1 - Math.min(1, p.s / 0.1), 2)) * (1 - Math.min(1, Math.max(0, (p.s - 0.65) / 0.35))) * 0.02 * amt;
        sz[i] = 0.3 + p.s * 1.0;
      }
      g.attributes.position.needsUpdate = true; g.attributes.aA.needsUpdate = true; g.attributes.aS.needsUpdate = true;
    },
  };
  return m;
}
