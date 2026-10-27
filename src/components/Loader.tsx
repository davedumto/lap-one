'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { LoaderPhase } from '@/engine/types';

export interface LoaderHandle {
  getRefs: () => {
    loader: HTMLElement;
    loaderFill: HTMLElement;
    loaderNote: HTMLElement;
    loaderLights: HTMLElement[];
    enterSoundBtn: HTMLButtonElement;
    enterMuteBtn: HTMLButtonElement;
    trackPathBg: SVGPathElement;
    trackPathDraw: SVGPathElement;
  };
}

export interface LoaderProps {
  phase: LoaderPhase;
  progressFraction: number;
  loadNote: string;
  onRetry: () => void;
  fatalError: string | null;
}

const Loader = forwardRef<LoaderHandle, LoaderProps>(function Loader({ phase, progressFraction, loadNote, onRetry, fatalError }, ref) {
  const loaderRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const lightRefs = useRef<(HTMLElement | null)[]>([]);
  const enterSoundRef = useRef<HTMLButtonElement>(null);
  const enterMuteRef = useRef<HTMLButtonElement>(null);
  const trackBgRef = useRef<SVGPathElement>(null);
  const trackDrawRef = useRef<SVGPathElement>(null);

  useImperativeHandle(ref, () => ({
    getRefs: () => ({
      loader: loaderRef.current!,
      loaderFill: fillRef.current!,
      loaderNote: noteRef.current!,
      loaderLights: lightRefs.current.filter((l): l is HTMLElement => l !== null),
      enterSoundBtn: enterSoundRef.current!,
      enterMuteBtn: enterMuteRef.current!,
      trackPathBg: trackBgRef.current!,
      trackPathDraw: trackDrawRef.current!,
    }),
  }));

  if (fatalError) {
    return (
      <div id="error-screen" role="alert">
        <div className="err-title">Couldn&apos;t load</div>
        <p className="err-msg">{fatalError}</p>
        <button type="button" className="err-retry" onClick={onRetry}>Retry</button>
      </div>
    );
  }

  const isReady = phase === 'ready' || phase === 'entered';
  const isDone = phase === 'entered';

  return (
    <div id="loader" role="status" ref={loaderRef} className={`${isReady ? 'rdy ' : ''}${isDone ? 'done' : ''}`.trim()}>
      <div className="ld-bg" aria-hidden="true" />
      <div className="ld-shade" aria-hidden="true" />
      <div className="ld-streaks" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <div className="ld-body">
        <svg className="ld-track" viewBox="0 0 120 120" aria-hidden="true">
          <path ref={trackBgRef} id="ld-path" className="ld-base" />
          <path ref={trackDrawRef} className="ld-draw" pathLength={1} />
          <circle r={3.4} className="ld-dot">
            <animateMotion dur="4.2s" repeatCount="indefinite" rotate="auto">
              <mpath href="#ld-path" />
            </animateMotion>
          </circle>
        </svg>
        <div className="ld-title">
          <div className="wm"><i />Lap One</div>
          <div className="ld-sub">A GT3 race car, one night circuit, driven by your scroll</div>
        </div>
        <div className="ld-lights" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} ref={(el) => { lightRefs.current[i] = el; }} className={progressFraction >= (i + 0.6) / 5 ? 'on' : undefined} />
          ))}
        </div>
        <div id="lbar"><b ref={fillRef as React.RefObject<HTMLElement>} style={{ transform: `scaleX(${progressFraction})` }} /></div>
        <div id="lnote" ref={noteRef}>{loadNote}</div>
        <div id="enter">
          <button className="btn" id="enter-snd" type="button" ref={enterSoundRef}>
            Enter with sound <span className="ar"><svg viewBox="0 0 16 16" fill="none" strokeWidth={2} aria-hidden="true"><path d="M2 8h11M9 3l5 5-5 5" /></svg></span>
          </button>
          <button className="plain" id="enter-mute" type="button" ref={enterMuteRef}>Without sound</button>
          <div className="ld-hint">Turn your volume up &middot; scroll to drive</div>
        </div>
      </div>
    </div>
  );
});

export default Loader;
