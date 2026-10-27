'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { PANELS } from './panelData';
import type { PanelRefs } from '@/engine/types';

export interface PanelsHandle {
  getPanelRefs: () => PanelRefs[];
  getGoLinks: () => { el: HTMLElement; go: number }[];
  getLapTimeEl: () => HTMLElement;
}

const Panels = forwardRef<PanelsHandle>(function Panels(_props, ref) {
  const panelEls = useRef<(HTMLElement | null)[]>([]);
  const copyEls = useRef<(HTMLElement | null)[]>([]);
  const headingEls = useRef<(HTMLHeadingElement | null)[]>([]);
  const nameEls = useRef<(HTMLElement | null)[]>([]);
  const segsContainerEls = useRef<(HTMLElement | null)[]>([]);
  const numeralEls = useRef<(HTMLElement | null)[]>([]);
  const goLinkEls = useRef<{ el: HTMLElement; go: number }[]>([]);
  const lapTimeRef = useRef<HTMLElement>(null);

  useImperativeHandle(ref, () => ({
    // .fx elements are read directly from each panel's rendered DOM rather than
    // accumulated via ref callbacks, since React may invoke a ref callback more than
    // once (e.g. StrictMode double-render in dev) and a push-based collector would
    // then duplicate entries.
    getPanelRefs: () =>
      PANELS.map((p, i) => ({
        el: panelEls.current[i]!,
        copy: copyEls.current[i]!,
        heading: headingEls.current[i]!,
        nameLabel: nameEls.current[i] ?? null,
        segs: segsContainerEls.current[i] ? Array.from(segsContainerEls.current[i]!.children) as HTMLElement[] : null,
        fx: Array.from(panelEls.current[i]?.querySelectorAll<HTMLElement>('.fx') ?? []),
        numeral: numeralEls.current[i] ?? null,
      })),
    getGoLinks: () => goLinkEls.current,
    getLapTimeEl: () => lapTimeRef.current!,
  }));

  return (
    <main id="panels">
      {PANELS.map((p, i) => {
        const Heading = p.headingLevel === 1 ? 'h1' : 'h2';
        return (
          <section
            key={p.id}
            id={p.id}
            data-i={p.index}
            className={`panel${p.right ? ' right' : ''}`}
            ref={(el) => { panelEls.current[i] = el; }}
          >
            <div className="copy" ref={(el) => { copyEls.current[i] = el; }}>
              <div className="tag">
                {p.sector && <span className="sec">{p.sector}</span>}
                {p.sector && (
                  <span className="segs" ref={(el) => { segsContainerEls.current[i] = el; }}>
                    <i /><i /><i />
                  </span>
                )}
                <span className="nm" ref={(el) => { nameEls.current[i] = el; }}>{p.sectorName || 'A scroll film in five sectors'}</span>
              </div>
              <Heading data-split-chars={p.splitChars || undefined} ref={(el: HTMLHeadingElement | null) => { headingEls.current[i] = el; }}>
                {p.heading}
              </Heading>
              {p.lede && <p className="lede fx">{p.lede}</p>}
              {p.body && <p className="fx">{p.body}</p>}
              {p.id === 's0' && (
                <div className="cta-row fx">
                  <button
                    className="ignite"
                    type="button"
                    ref={(el) => { if (el) goLinkEls.current.push({ el, go: 1 }); }}
                  >
                    <span className="ign"><b>Start</b></span>
                    <span className="t">Engine start<i>Then keep scrolling</i></span>
                  </button>
                </div>
              )}
              {p.id === 's5' && (
                <>
                  <p className="fx">
                    That was the whole lap. Your time: <b className="lt" id="laptime" ref={lapTimeRef as React.RefObject<HTMLElement>}>&ndash;:&ndash;&ndash;.&ndash;&ndash;&ndash;</b>
                  </p>
                  <div className="cta-row fx">
                    <a className="btn" href="#top" ref={(el) => { if (el) goLinkEls.current.push({ el, go: 0 }); }}>
                      Replay the lap
                      <span className="ar"><svg viewBox="0 0 16 16" fill="none" strokeWidth={2} aria-hidden="true"><path d="M14 8H3M7 3L2 8l5 5" /></svg></span>
                    </a>
                  </div>
                  <div className="by fx">
                    <span>Designed and built by <b>David Ejere</b></span>
                    <div className="links">
                      <a href="https://github.com/davedumto" target="_blank" rel="noopener">
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.4-5.27 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" /></svg>
                        GitHub
                      </a>
                      <a href="mailto:ejeredavid2001@gmail.com">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><rect x={3} y={5} width={18} height={14} rx={2} /><path d="m3 7 9 6 9-6" /></svg>
                        Email me
                      </a>
                    </div>
                  </div>
                  <p className="fine fx">
                    Independent design study. Not affiliated with any manufacturer or team.
                  </p>
                </>
              )}
            </div>
            {p.hasNumeral && <div className="numeral" ref={(el) => { numeralEls.current[i] = el; }}>{String(p.index).padStart(2, '0')}</div>}
          </section>
        );
      })}
    </main>
  );
});

export default Panels;
