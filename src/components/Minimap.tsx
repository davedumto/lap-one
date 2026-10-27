'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';

export interface MinimapHandle {
  getRefs: () => {
    root: HTMLElement;
    pathBg: SVGPathElement;
    pathProgress: SVGPathElement;
    dot: SVGCircleElement;
    start: SVGCircleElement;
    distance: HTMLElement;
  };
}

const Minimap = forwardRef<MinimapHandle>(function Minimap(_props, ref) {
  const rootRef = useRef<HTMLElement>(null);
  const bgRef = useRef<SVGPathElement>(null);
  const pgRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const startRef = useRef<SVGCircleElement>(null);
  const distRef = useRef<HTMLElement>(null);

  useImperativeHandle(ref, () => ({
    getRefs: () => ({
      root: rootRef.current!,
      pathBg: bgRef.current!,
      pathProgress: pgRef.current!,
      dot: dotRef.current!,
      start: startRef.current!,
      distance: distRef.current!,
    }),
  }));

  return (
    <aside id="mini" aria-hidden="true" ref={rootRef as React.RefObject<HTMLElement>}>
      <svg viewBox="0 0 120 120">
        <path className="bg" ref={bgRef} pathLength={1} />
        <path className="pg" ref={pgRef} pathLength={1} strokeDasharray="0 1" />
        <circle className="st" ref={startRef} r={2.6} />
        <circle className="dot" ref={dotRef} r={4} />
      </svg>
      <div className="meta">Track <b ref={distRef}>0000</b> m</div>
    </aside>
  );
});

export default Minimap;
