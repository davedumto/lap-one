import { clamp, lerp, splineRows } from './util';
import { CMAX } from './scrollModel';

// camera keys [c, d, az, el, lx,ly,lz, fov, shiftX]
const KEYS: number[][] = [
  [0, 11.5, -34, 6, 1.2, .7, 0, 32, .13], [.45, 9.4, -60, 5, .9, .66, 0, 31, .15], [.85, 6.6, -92, 3.5, .2, .6, 0, 29, -.18],
  [1.2, 6, -142, 4.5, .4, .58, 0, 28, -.18], [1.5, 6.4, -182, 6, .4, .55, 0, 29, -.18], [1.85, 7.4, -246, 6, 0, .55, 0, 30, .18],
  [2.2, 8, -272, 7, -.2, .55, 0, 30, .18], [2.6, 9.5, -300, 34, -.2, .55, 0, 32, .18], [2.9, 3.4, -246, 3, 1.4, .38, .9, 27, -.2],
  [3.3, 3, -236, 1.5, 1.4, .36, .9, 26, -.2], [3.7, 9.5, -330, 7, 1.2, .7, 0, 46, .14], [4, 9, -360, 5, 4, .75, 0, 58, .14],
  [4.5, 8.2, -362, 3.5, 6, .8, 0, 68, 0], [4.8, 12, -372, 22, 3, .6, 0, 50, .14], [5, 16, -380, 40, 0, .6, 0, 40, .24],
];
const TAB_N = 700;

// A smoothed lookup table of camera params over c in [0, CMAX], built once at module load.
// This reproduces the original's table build exactly (same spline, same 3-pass box blur over
// a window of 9 on each side) so the camera path is pixel-identical to the prototype.
const TAB: number[][] = (() => {
  const rows: number[][] = [];
  for (let i = 0; i < TAB_N; i++) {
    const c = (i / (TAB_N - 1)) * CMAX;
    let k = 0; while (k < KEYS.length - 2 && c > KEYS[k + 1][0]) k++;
    const f = clamp((c - KEYS[k][0]) / (KEYS[k + 1][0] - KEYS[k][0]));
    rows.push(splineRows(KEYS.map((r) => r.slice(1)), k + f));
  }
  for (let pass = 0; pass < 3; pass++) {
    const R = 9;
    const out = rows.map((r, i) => r.map((_, j) => {
      let s = 0, n = 0;
      for (let q = -R; q <= R; q++) { const ii = clamp(i + q, 0, TAB_N - 1); s += rows[ii][j]; n++; }
      return s / n;
    }));
    out.forEach((r, i) => { rows[i] = r; });
  }
  return rows;
})();

export function camAt(c: number): number[] {
  const t = clamp(c / CMAX) * (TAB_N - 1), i = Math.min(TAB_N - 2, Math.floor(t)), f = t - i;
  return TAB[i].map((v, j) => lerp(v, TAB[i + 1][j], f));
}
