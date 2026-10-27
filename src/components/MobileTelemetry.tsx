'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';

export interface MobileTelemetryHandle {
  getRefs: () => { gear: HTMLElement; speed: HTMLElement };
}

const MobileTelemetry = forwardRef<MobileTelemetryHandle>(function MobileTelemetry(_props, ref) {
  const gearRef = useRef<HTMLElement>(null);
  const speedRef = useRef<HTMLElement>(null);

  useImperativeHandle(ref, () => ({
    getRefs: () => ({ gear: gearRef.current!, speed: speedRef.current! }),
  }));

  return (
    <div id="mtele" aria-hidden="true">
      <b ref={gearRef as React.RefObject<HTMLElement>}>N</b>
      <span><em ref={speedRef as React.RefObject<HTMLElement>} style={{ fontStyle: 'normal' }}>000</em><i>KM/H</i></span>
    </div>
  );
});

export default MobileTelemetry;
