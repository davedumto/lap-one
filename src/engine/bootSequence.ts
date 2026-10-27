import * as THREE from 'three';
import { buildWorld, type WorldObject } from './world';
import { buildTrack, minimapPath, type TrackObject, type MinimapPath } from './track';
import { buildScenery, type SceneryObject } from './scenery';
import { loadCar, makeEnv, buildRig, type CarRig } from './car';
import { buildStreams, buildSmoke, buildWarp, buildSparks, buildStartLights, buildLine, type StreamLines, type WarpLines, type SparkPoints, type StartLights, type RacingLine, type SmokePoints } from './fx';
import { DisposalRegistry } from './disposables';

const CAR_GLB_SIZE_BYTES = 5_070_000; // fallback for onProgress's total when Content-Length is absent

export interface BootResult {
  worldObj: WorldObject;
  trackObj: TrackObject;
  sceneryObj: SceneryObject;
  carObj: CarRig;
  rig: THREE.Group;
  spots: THREE.SpotLight[];
  tail: THREE.PointLight;
  shadow: THREE.Mesh;
  streams: StreamLines;
  smoke: SmokePoints;
  warp: WarpLines;
  sparks: SparkPoints;
  startL: StartLights;
  line: RacingLine;
  envMats: THREE.MeshStandardMaterial[];
  mm: MinimapPath;
}

export interface BootCallbacks {
  onStep: (fraction: number, note?: string) => void;
}

// Loads and assembles the whole scene, in the same order as the original boot() so that
// anything relying on load order (e.g. env map existing before buildRig reads envMapIntensity)
// keeps working identically.
export async function bootScene(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  carGlbUrl: string,
  registry: DisposalRegistry,
  cb: BootCallbacks,
): Promise<BootResult> {
  cb.onStep(0.08, 'Building the circuit');
  const worldObj = buildWorld(scene);
  const trackObj = buildTrack(scene);
  const sceneryObj = buildScenery(scene, trackObj.road.geometry);

  cb.onStep(0.2, 'Lighting the pit lane');
  const env = makeEnv(renderer);
  scene.environment = env;
  registry.track({ dispose: () => env.dispose() });

  cb.onStep(0.35, 'Unpacking the car');
  const model = await loadCar(carGlbUrl, (ev) => {
    const total = ev.total || CAR_GLB_SIZE_BYTES;
    const frac = 0.35 + 0.35 * Math.min(1, ev.loaded / total); // 0.35 -> 0.70 while downloading
    cb.onStep(frac, 'Unpacking the car');
  });

  cb.onStep(0.7, 'Warming the tyres');
  const carObj = buildRig(model, env);
  const rig = carObj.rig;
  scene.add(rig);
  const envMats: THREE.MeshStandardMaterial[] = [];
  rig.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const mesh = o as THREE.Mesh;
      const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      ms.forEach((m) => {
        const sm = m as THREE.MeshStandardMaterial;
        if (sm.envMapIntensity !== undefined && !envMats.includes(sm)) envMats.push(sm);
      });
    }
  });
  envMats.forEach((m) => { (m as unknown as { _e0: number })._e0 = m.envMapIntensity; });

  // headlights, tail, contact shadow
  const spots: THREE.SpotLight[] = [];
  for (const z of [-0.62, 0.62]) {
    const s = new THREE.SpotLight(0xdfe9ff, 0, 90, 0.42, 0.9, 1.2);
    s.position.set(2.0, 0.62, z); s.target.position.set(30, 0, z * 0.6);
    rig.add(s, s.target); spots.push(s);
  }
  const tail = new THREE.PointLight(0xff2a1a, 0, 14, 2); tail.position.set(-2.6, 0.7, 0); rig.add(tail);
  const sc = document.createElement('canvas'); sc.width = sc.height = 128; const sx = sc.getContext('2d')!;
  const gr = sx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sx.fillStyle = gr; sx.fillRect(0, 0, 128, 128);
  const shadowTex = new THREE.CanvasTexture(sc);
  registry.track({ dispose: () => shadowTex.dispose() });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.4), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, 0.03, 0); shadow.renderOrder = 3; rig.add(shadow);

  const key = new THREE.DirectionalLight(0xffe2c0, 2.6); key.position.set(120, 90, -60); scene.add(key); scene.userData.key = key;
  const hemi = new THREE.HemisphereLight(0x9fb4d8, 0x14100c, 0.35); scene.add(hemi); scene.userData.hemi = hemi;

  const streams = buildStreams(); rig.add(streams);
  const smoke = buildSmoke(streams.userData.paths, streams.userData.M); rig.add(smoke);
  const warp = buildWarp(); scene.add(warp);
  const sparks = buildSparks(); scene.add(sparks);
  const startL = buildStartLights(scene);
  const line = buildLine(); scene.add(line);

  const mm = minimapPath(120, 10);

  return { worldObj, trackObj, sceneryObj, carObj, rig, spots, tail, shadow, streams, smoke, warp, sparks, startL, line, envMats, mm };
}
