import { clamp } from './util';

// shared powertrain model: speed -> gear, revs, throttle/brake (used by cluster + audio)
export const EDGES = [0, 4, 62, 108, 152, 202, 256, 340];

export interface DriveState {
  gear: number;
  rpm: number;
  thr: number;
  brk: number;
  shift: number;
  kmh: number;
  upshift: boolean;
  downshift: boolean;
  update(kmh: number, dt: number, vS: number, brakeZone: number): void;
}

export function createDrive(): DriveState {
  const s: DriveState = { gear: 0, rpm: 0.11, thr: 0, brk: 0, shift: 0, kmh: 0, upshift: false, downshift: false, update: () => {} };
  let prevK = 0, accel = 0, tgt = 0.11;
  s.update = (kmh: number, dt: number, vS: number, brakeZone: number) => {
    s.upshift = s.downshift = false;
    const a = dt > 0 ? (kmh - prevK) / dt : 0; prevK = kmh;
    accel += (a - accel) * (1 - Math.exp(-dt * 6));
    // gear with hysteresis
    let g = s.gear;
    if (kmh < 3) g = 0;
    else {
      if (g === 0) g = 1;
      while (g < 6 && kmh > EDGES[g + 1] + 1.5) g++;
      while (g > 1 && kmh < EDGES[g] - 6) g--;
    }
    if (g > s.gear && s.gear > 0) { s.upshift = true; s.shift = 1; }
    if (g < s.gear && g > 0) { s.downshift = true; s.shift = 1; }
    s.gear = g;
    s.shift = Math.max(0, s.shift - dt * 5);
    const lo = EDGES[g], hi = EDGES[g + 1];
    tgt = g === 0 ? 0.11 : 0.34 + 0.56 * clamp((kmh - lo) / (hi - lo));
    if (g > 0 && kmh < 3) tgt = 0.11;
    s.rpm += (tgt - s.rpm) * (1 - Math.exp(-dt * (s.shift > 0.2 ? 6 : 12)));
    const braking = brakeZone > 0.2 || accel < -14;
    s.brk = braking ? clamp(Math.max(brakeZone, -accel / 90)) : 0;
    s.thr = braking || kmh < 1 ? 0.03 : clamp(0.18 + Math.abs(vS) * 2.2 + Math.max(0, accel) / 150);
    s.kmh = kmh;
  };
  return s;
}
