import type { DriveState } from './drive';
import type { MinimapPath, TrackPoint } from './track';

// ---- DOM refs the engine mutates per frame. All nodes are created and owned by React
// components; the engine never queries the document for them.

export interface ClusterRefs {
  svg: SVGSVGElement;
}

export interface PanelRefs {
  el: HTMLElement;
  copy: HTMLElement;
  heading: HTMLHeadingElement;
  nameLabel: HTMLElement | null;
  segs: HTMLElement[] | null;
  fx: HTMLElement[];
  numeral: HTMLElement | null;
}

export interface EngineRefs {
  canvas: HTMLCanvasElement;
  loader: HTMLElement;
  loaderFill: HTMLElement;
  loaderNote: HTMLElement;
  loaderLights: HTMLElement[];
  enterSoundBtn: HTMLButtonElement;
  enterMuteBtn: HTMLButtonElement;
  soundBtn: HTMLButtonElement;
  musicBtn: HTMLButtonElement;
  homeLink: HTMLElement;
  chips: HTMLElement[];
  panels: PanelRefs[];
  cluster: ClusterRefs;
  mobileGear: HTMLElement;
  mobileSpeed: HTMLElement;
  minimapEl: HTMLElement;
  minimapPathBg: SVGPathElement;
  minimapPathProgress: SVGPathElement;
  minimapDot: SVGCircleElement;
  minimapStart: SVGCircleElement;
  minimapDistance: HTMLElement;
  loaderTrackPathBg: SVGPathElement;
  loaderTrackPathDraw: SVGPathElement;
  lapTimeEl: HTMLElement;
  goLinks: { el: HTMLElement; go: number }[];
  chipLinks: { el: HTMLElement; go: number }[];
}

export type LoaderPhase = 'loading' | 'ready' | 'entered' | 'error';

export interface EngineCallbacks {
  onLoaderPhase: (phase: LoaderPhase) => void;
  onLoadProgress: (fraction: number) => void;
  onSoundChange: (on: boolean) => void;
  onMusicChange: (on: boolean) => void;
  onFlagReached: (lapTimeText: string) => void;
  onQualityTierChange: (tier: 'high' | 'medium' | 'low') => void;
  onFatalError: (error: unknown) => void;
}

export interface FrameContext {
  c: number;
  dt: number;
  mob: boolean;
  now: number;
  u: number;
  kmh: number;
  drive: DriveState;
  vS: number;
  mm: MinimapPath;
  at: (u: number) => TrackPoint;
  prog: number;
}
