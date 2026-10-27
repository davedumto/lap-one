export type QualityTier = 'high' | 'medium' | 'low';

export interface TierConfig {
  pixelRatioCap: number;
  bloom: boolean;
  mirror: boolean;
  smokeCount: number; // fraction of the full 1600-particle budget
  sparkCount: number; // fraction of the full 240-particle budget
}

const TIERS: Record<QualityTier, TierConfig> = {
  high: { pixelRatioCap: 2, bloom: true, mirror: true, smokeCount: 1, sparkCount: 1 },
  medium: { pixelRatioCap: 1.5, bloom: true, mirror: true, smokeCount: 0.6, sparkCount: 0.75 },
  low: { pixelRatioCap: 1, bloom: false, mirror: false, smokeCount: 0.25, sparkCount: 0.4 },
};

export function tierConfig(tier: QualityTier): TierConfig {
  return TIERS[tier];
}

function nextLowerTier(tier: QualityTier): QualityTier | null {
  if (tier === 'high') return 'medium';
  if (tier === 'medium') return 'low';
  return null;
}

export interface DeviceHeuristicInput {
  isMobile: boolean;
  deviceMemory?: number; // navigator.deviceMemory, GB
  hardwareConcurrency?: number;
  gpuRenderer?: string; // WEBGL_debug_renderer_info UNMASKED_RENDERER_WEBGL
}

// Starting tier picked from a cheap static heuristic (no synthetic benchmark — the runtime
// downgrade below already covers devices this heuristic misjudges).
export function pickStartingTier(input: DeviceHeuristicInput): QualityTier {
  const renderer = (input.gpuRenderer || '').toLowerCase();
  const looksLowEndGpu = /(adreno 3|adreno 4|mali-4|mali-t|powervr sgx|intel hd graphics [23456]00)/.test(renderer);
  const looksHighEndGpu = /(apple m|adreno 7|adreno 6[5-9]|mali-g7|mali-g8|nvidia|radeon rx|geforce)/.test(renderer);

  let score = 0;
  if (input.isMobile) score -= 1;
  if ((input.deviceMemory ?? 4) <= 2) score -= 2;
  else if ((input.deviceMemory ?? 4) >= 8) score += 1;
  if ((input.hardwareConcurrency ?? 4) <= 2) score -= 2;
  else if ((input.hardwareConcurrency ?? 4) >= 8) score += 1;
  if (looksLowEndGpu) score -= 2;
  if (looksHighEndGpu) score += 2;

  if (score <= -3) return 'low';
  if (score <= 0) return 'medium';
  return 'high';
}

export function detectDeviceHeuristic(gl: WebGLRenderingContext | WebGL2RenderingContext | null): DeviceHeuristicInput {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  let gpuRenderer: string | undefined;
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpuRenderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  }
  return {
    isMobile: typeof window !== 'undefined' ? window.innerWidth <= 820 : false,
    deviceMemory: (nav as (Navigator & { deviceMemory?: number }) | undefined)?.deviceMemory,
    hardwareConcurrency: nav?.hardwareConcurrency,
    gpuRenderer,
  };
}

// Rolling average frame time used to decide whether to drop a quality tier. Ignores the
// loader phase, hidden-tab frames and the first 60 frames after entering (warm-up/GC noise),
// drops only one tier at a time, and waits out a cooldown after any downgrade before
// evaluating again, so a single momentary stutter cannot cause oscillation.
export class FrameTimeMonitor {
  private samples: number[] = [];
  private readonly windowSize = 120; // ~2s at 60fps
  private cooldownUntil = 0;
  private framesSinceEntered = 0;

  /** Returns true when the caller should drop one quality tier. */
  recordFrame(dtMs: number, now: number, opts: { loading: boolean; hidden: boolean; entered: boolean }): boolean {
    if (opts.loading || opts.hidden) return false;
    if (!opts.entered) { this.framesSinceEntered = 0; return false; }
    this.framesSinceEntered++;
    if (this.framesSinceEntered <= 60) return false;

    this.samples.push(dtMs);
    if (this.samples.length > this.windowSize) this.samples.shift();
    if (this.samples.length < this.windowSize) return false;
    if (now < this.cooldownUntil) return false;

    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    if (avg > 22) {
      this.cooldownUntil = now + 3000;
      this.samples = [];
      return true;
    }
    return false;
  }

  reset(): void {
    this.samples = [];
    this.framesSinceEntered = 0;
    this.cooldownUntil = 0;
  }
}

export function downgradeFrom(tier: QualityTier): QualityTier {
  return nextLowerTier(tier) ?? tier;
}
