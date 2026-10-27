'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';

export interface InstrumentClusterHandle {
  getSvg: () => SVGSVGElement;
}

// The dial face markup (ticks, bands, needles, labels) is generated procedurally by
// panels.ts's buildCluster(), exactly as in the original prototype, because its geometry
// is derived from a shared polar-coordinate helper rather than hand-authored markup.
// This component only owns the <svg> mount point so the twin-dial housing stays
// pixel-concentric with the CSS that positions it.
const InstrumentCluster = forwardRef<InstrumentClusterHandle>(function InstrumentCluster(_props, ref) {
  const svgRef = useRef<SVGSVGElement>(null);

  useImperativeHandle(ref, () => ({
    getSvg: () => svgRef.current!,
  }));

  return (
    <aside id="tele" aria-hidden="true">
      <svg id="clu" ref={svgRef} viewBox="0 0 800 264" />
    </aside>
  );
});

export default InstrumentCluster;
