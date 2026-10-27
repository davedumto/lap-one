'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';

export interface HeaderHandle {
  getRefs: () => {
    homeLink: HTMLElement;
    chips: HTMLElement[];
    soundBtn: HTMLButtonElement;
    musicBtn: HTMLButtonElement;
    chipLinks: { el: HTMLElement; go: number }[];
  };
}

export interface HeaderProps {
  soundOn: boolean;
  musicOn: boolean;
}

const SECTOR_CHIPS = [
  { label: 'Start', go: 0, hideMobile: true },
  { label: 'S1', go: 1, hideMobile: false },
  { label: 'S2', go: 2, hideMobile: false },
  { label: 'S3', go: 3, hideMobile: false },
  { label: 'S4', go: 4, hideMobile: false },
  { label: 'S5', go: 5, hideMobile: false },
];

const Header = forwardRef<HeaderHandle, HeaderProps>(function Header({ soundOn, musicOn }, ref) {
  const homeRef = useRef<HTMLAnchorElement>(null);
  const chipRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const soundRef = useRef<HTMLButtonElement>(null);
  const musicRef = useRef<HTMLButtonElement>(null);

  useImperativeHandle(ref, () => ({
    getRefs: () => ({
      homeLink: homeRef.current!,
      chips: chipRefs.current.filter((c): c is HTMLAnchorElement => c !== null),
      soundBtn: soundRef.current!,
      musicBtn: musicRef.current!,
      chipLinks: chipRefs.current.map((el, i) => ({ el: el!, go: SECTOR_CHIPS[i].go })).filter((c) => c.el),
    }),
  }));

  return (
    <header className="top">
      <a className="brand" href="#top" id="home" aria-label="Lap One, back to the start" ref={homeRef}>
        <span className="wm"><i />Lap One</span>
        <span className="sub">A GT3 study</span>
      </a>
      <div className="hr">
        <nav id="chips" aria-label="Sectors">
          {SECTOR_CHIPS.map((chip, i) => (
            <a
              key={chip.label}
              href={chip.go === 0 ? '#s0' : `#s${chip.go}`}
              className={chip.hideMobile ? 'hide-m' : undefined}
              ref={(el) => { chipRefs.current[i] = el; }}
            >
              {chip.label}
            </a>
          ))}
        </nav>
        <button id="mus" type="button" aria-pressed={musicOn} aria-label="Music on or off" ref={musicRef}>
          <i className="led" /><span className="lbl">Music</span><span className="st">{musicOn ? 'On' : 'Off'}</span>
        </button>
        <button id="snd" type="button" aria-pressed={soundOn} aria-label="Engine sound on or off" ref={soundRef}>
          <i className="led" /><span className="lbl">Engine</span><span className="st">{soundOn ? 'On' : 'Off'}</span>
        </button>
      </div>
    </header>
  );
});

export default Header;
