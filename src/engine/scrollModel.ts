import { clamp, smoothDamp, type SpringState } from './util';

export const CMAX = 5;

export interface ScrollModelState {
  S: number;
  S1: number;
  vS: number;
  cTarget: number;
  idleT: number;
  expectedY: number;
  cruiseAcc: number;
  glide: { from: number; to: number; t0: number; dur: number } | null;
}

export function createScrollModel(): ScrollModelState {
  return { S: 0, S1: 0, vS: 0, cTarget: 0, idleT: 0, expectedY: 0, cruiseAcc: 0, glide: null };
}

export const docRange = (): number => Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
export const readC = (): number => clamp(window.scrollY / docRange(), 0, 1) * CMAX;
export const cToY = (c: number): number => (c / CMAX) * docRange();

export function glideTo(state: ScrollModelState, c: number): void {
  const from = window.scrollY, to = cToY(c), dist = Math.abs(to - from);
  state.glide = { from, to, t0: performance.now(), dur: clamp(900 + dist * 0.35, 1100, 3600) };
}

export function cancelGlide(state: ScrollModelState): void {
  state.glide = null;
}

const st1: SpringState = { v: 0 }, st: SpringState = { v: 0 };

// Two critically-damped stages in series: soft start and soft stop, no stair-stepping from wheel ticks.
// Called once per frame, in the same position within the frame as the original main.js so that
// every value computed here (S, vS, cTarget) is available, unchanged, to the steps that follow.
export function updateScroll(
  state: ScrollModelState,
  now: number,
  dt: number,
  forcedC: number | undefined,
  entered: boolean,
  reduceMotion: boolean,
): void {
  if (state.glide) {
    const t = clamp((now - state.glide.t0) / state.glide.dur);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    window.scrollTo(0, state.glide.from + (state.glide.to - state.glide.from) * e);
    if (t >= 1) state.glide = null;
  }
  state.cTarget = forcedC !== undefined ? forcedC : readC();
  if (forcedC !== undefined) {
    state.S = state.S1 = state.cTarget; st.v = st1.v = 0; state.vS = 0;
    return;
  }
  state.S1 = smoothDamp(state.S1, state.cTarget, st1, 0.42, dt);
  state.S = smoothDamp(state.S, state.S1, st, 0.42, dt);
  state.vS = st.v;
  // cruise: when the scroll goes idle the car keeps rolling at a gentle pace instead of freezing
  if (Math.abs(window.scrollY - state.expectedY) > 2) state.idleT = 0; else state.idleT += dt;
  state.expectedY = window.scrollY;
  if (!state.glide && !reduceMotion && entered && !document.hidden && state.cTarget > 0.3 && state.cTarget < 4.95 && state.idleT > 0.6) {
    state.cruiseAcc += dt * 0.07 * (docRange() / CMAX);
    const px = Math.floor(state.cruiseAcc);
    if (px >= 1) { state.cruiseAcc -= px; window.scrollBy(0, px); state.expectedY = window.scrollY; }
  }
}
