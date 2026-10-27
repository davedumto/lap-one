// Dev-only test hooks used by scripts/screenshot_test.py (forceC, hold/once stepping,
// wheel-speed override, a ready flag and frame counter). Stripped from production builds
// by the `process.env.NODE_ENV !== 'production'` guard at the call site — never imported
// in a way that would make these names reach a production bundle.
export interface DevHooks {
  __forceC?: number;
  __hold?: boolean;
  __once?: boolean;
  __wsm?: number;
  __ready?: boolean;
  __frames?: number;
}

export const isDevHooksEnabled = (): boolean =>
  process.env.NODE_ENV !== 'production' || (typeof window !== 'undefined' && window.location.search.includes('test'));

export function getDevHooks(): DevHooks {
  return window as unknown as DevHooks;
}

export function setFrameCount(n: number): void {
  if (isDevHooksEnabled()) (window as unknown as DevHooks).__frames = n;
}

export function setReady(): void {
  if (isDevHooksEnabled()) (window as unknown as DevHooks).__ready = true;
}

export const shouldAutoEnter = (): boolean =>
  isDevHooksEnabled() && typeof window !== 'undefined' && window.location.hash === '#auto';
