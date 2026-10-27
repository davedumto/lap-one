import { clamp, sstep, easeOut } from './util';
import { LENGTH } from './track';
import type { EngineRefs, FrameContext } from './types';

const WIN: [number, number][] = [[-9, 0.5], [0.62, 1.95], [2.05, 2.8], [2.88, 3.55], [3.7, 4.6], [4.72, 9]];
const ENTER = 0.3, EXIT = 0.24;
const SECN = ['Start', 'Shape', 'Air', 'Brake', 'Night', 'Flag'];
const CT = [0, 1.0, 2.3, 3.2, 4.2, 5];

interface PanelState {
  el: HTMLElement;
  copy: HTMLElement;
  words: HTMLElement[];
  nameLabel: HTMLElement | null;
  segs: HTMLElement[] | null;
  fx: HTMLElement[];
  numeral: HTMLElement | null;
  index: number;
}

// Splits a heading's text into word (or char) spans for the rise-in reveal animation.
// This must run once per panel, against the heading element the React component rendered,
// using the same two-level <span class="w"><span class="wi">text</span></span> structure
// the original CSS transforms/animations target.
function splitWords(h: HTMLHeadingElement, chars: boolean): HTMLElement[] {
  const txt = (h.textContent || '').trim(); h.setAttribute('aria-label', txt); h.textContent = '';
  const out: HTMLElement[] = [];
  const mk = (s: string) => {
    const w = document.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true');
    const i = document.createElement('span'); i.className = 'wi'; i.textContent = s; w.appendChild(i); h.appendChild(w); out.push(i);
  };
  if (chars) { for (const ch of txt) { if (ch === ' ') { const s = document.createElement('span'); s.className = 'sp'; h.appendChild(s); } else mk(ch); } }
  else txt.split(/\s+/).forEach((wd, i, arr) => { mk(wd); if (i < arr.length - 1) h.appendChild(document.createTextNode(' ')); });
  return out;
}

export interface Cluster {
  gear: SVGTextElement;
  spd: SVGTextElement;
  rpmT: SVGTextElement;
  sector: SVGTextElement;
  sBand: SVGPathElement;
  rBand: SVGPathElement;
  sNeedle: SVGGElement;
  rNeedle: SVGGElement;
  sc: [number, number];
  rc: [number, number];
  sTicks: { el: SVGElement; v: number }[];
  rTicks: { el: SVGElement; v: number }[];
  warn: SVGElement;
  warnd: SVGElement;
  segT: SVGElement[];
  segB: SVGElement[];
  tyres: SVGElement[];
  lastS: number;
  lastR: number;
  lastA: number;
}

export interface PanelsUI {
  update: (ctx: FrameContext) => void;
}

export function initPanels(refs: EngineRefs, go: (c: number) => void): PanelsUI {
  const panels: PanelState[] = refs.panels.map((p, i) => ({
    el: p.el, copy: p.copy,
    words: splitWords(p.heading, p.heading.hasAttribute('data-split-chars')),
    nameLabel: p.nameLabel, segs: p.segs, fx: p.fx, numeral: p.numeral, index: i,
  }));

  refs.goLinks.forEach(({ el, go: target }) => el.addEventListener('click', (e) => { e.preventDefault(); go(target === 0 ? 0 : 1); }));
  refs.chipLinks.forEach(({ el, go: n }) => el.addEventListener('click', (e) => { e.preventDefault(); go(CT[n]); }));
  refs.homeLink.addEventListener('click', (e) => { e.preventDefault(); go(0); });

  const cl = buildCluster(refs.cluster.svg);
  const { mobileGear: mg, mobileSpeed: ms } = refs;
  const mmPg = refs.minimapPathProgress, mmDot = refs.minimapDot, mmD = refs.minimapDistance;
  let lastGear = '', lastActive = -1, lastMiniHidden = false;

  function update({ c, u, kmh, drive, mm, at, prog, now }: FrameContext) {
    let active = 0;
    panels.forEach((p, i) => {
      const [a, b] = WIN[i];
      const e = clamp((c - a) / ENTER), x = clamp((c - (b - EXIT)) / EXIT);
      const vis = e > 0 && x < 1;
      p.el.style.visibility = vis ? 'visible' : 'hidden';
      if (!vis) return;
      if (e > 0.02 && x < 0.5) active = i;
      const ee = i === 0 ? 1 : e, xe = sstep(0, 1, x);
      // words rise
      const n = p.words.length;
      p.words.forEach((w, k) => {
        const lo = (k / n) * 0.55, t = easeOut(clamp((ee - lo) / 0.45)), tx = clamp(xe * 1.25 - (k / n) * 0.25);
        const y = (1 - t) * 112 - tx * 112;
        w.style.transform = `translate3d(0,${y.toFixed(2)}%,0) rotate(${((1 - t) * 5).toFixed(2)}deg)`;
      });
      // fx blocks
      p.fx.forEach((f, j) => {
        const t = easeOut(clamp((ee - 0.35 - j * 0.12) / 0.5));
        f.style.opacity = (t * (1 - xe)).toFixed(3);
        f.style.transform = `translate3d(0,${((1 - t) * 26).toFixed(1)}px,0)`;
      });
      p.copy.style.transform = `translate3d(0,${(-xe * 46).toFixed(1)}px,0)`;
      p.copy.style.opacity = (1 - xe * 0.9).toFixed(3);
      if (p.nameLabel) p.nameLabel.style.opacity = String(easeOut(clamp((ee - 0.05) / 0.4)) * (1 - xe));
      if (p.segs) { const pr = clamp((c - a) / (b - a)); p.segs.forEach((sg, k) => sg.classList.toggle('on', pr >= (k + 0.25) / 3)); }
      if (p.numeral) {
        const mid = (a + b) / 2;
        p.numeral.style.opacity = (easeOut(e) * (1 - xe)).toFixed(3);
        p.numeral.style.transform = `translate3d(${((mid - c) * -70).toFixed(1)}px,${((1 - easeOut(e)) * 60).toFixed(1)}px,0)`;
      }
    });
    if (active !== lastActive) {
      lastActive = active;
      refs.chips.forEach((a, i) => { if (i === active || (i === 0 && active === 0)) a.setAttribute('data-on', ''); else a.removeAttribute('data-on'); });
    }
    // chips: first chip (Start, index 0) is hidden on mobile; indices map S1..S5 to 1..5
    refs.chips.forEach((a, i) => { if (i < active) a.setAttribute('data-done', ''); else a.removeAttribute('data-done'); });

    // cluster
    const k = Math.max(0, Math.round(kmh)), g = drive.gear === 0 ? 'N' : String(drive.gear);
    if (g !== lastGear) { lastGear = g; mg.textContent = g; cl.gear.textContent = g; }
    const ks = String(k); if (cl.spd.textContent !== ks) { cl.spd.textContent = ks; ms.textContent = ks.padStart(3, '0'); }
    const rr = clamp(drive.rpm), rv = rr * 8, sv = clamp(kmh / 320) * 320;
    cl.rpmT.textContent = (Math.round(rv * 10) / 10).toFixed(1);
    cl.sBand.setAttribute('stroke-dasharray', `${(sv / 320).toFixed(4)} 1`); cl.rBand.setAttribute('stroke-dasharray', `${(rv / 8).toFixed(4)} 1`);
    cl.sNeedle.setAttribute('transform', `rotate(${((sv / 320) * 250).toFixed(2)} ${cl.sc[0]} ${cl.sc[1]})`);
    cl.rNeedle.setAttribute('transform', `rotate(${(-(rv / 8) * 250).toFixed(2)} ${cl.rc[0]} ${cl.rc[1]})`);
    if (Math.abs(sv - cl.lastS) > 0.4) { cl.lastS = sv; cl.sTicks.forEach((tk) => tk.el.classList.toggle('lit', tk.v <= sv)); }
    if (Math.abs(rv - cl.lastR) > 0.01) { cl.lastR = rv; cl.rTicks.forEach((tk) => tk.el.classList.toggle('lit', tk.v <= rv)); }
    const wv = rr > 0.88 && (Math.floor(now / 90) % 2 === 0) ? 1 : 0; cl.warn.style.opacity = String(wv); cl.warnd.style.opacity = String(wv);
    cl.segT.forEach((s, i) => s.classList.toggle('on', i < Math.round(clamp(drive.thr) * 10)));
    cl.segB.forEach((s, i) => s.classList.toggle('onb', i < Math.round(clamp(drive.brk) * 10)));
    cl.sector.textContent = 'S' + Math.max(1, active) + ' · ' + SECN[active];
    if (active !== cl.lastA) { cl.lastA = active; }
    const heat = clamp(kmh / 320) * 0.6 + clamp(drive.brk) * 0.4;
    cl.tyres.forEach((tr, i) => { const h = 6 + 16 * clamp(heat * (0.8 + 0.12 * i)); tr.setAttribute('height', h.toFixed(1)); tr.setAttribute('y', (206 - h).toFixed(1)); });
    // minimap
    mmPg.setAttribute('stroke-dasharray', `${prog.toFixed(4)} 1`);
    const [mx, my] = mm.map(at(u).p); mmDot.setAttribute('cx', mx.toFixed(1)); mmDot.setAttribute('cy', my.toFixed(1));
    mmD.textContent = String(Math.round(u * LENGTH)).padStart(4, '0');
    // Hide the 2D minimap during the overhead finale (c ~4.55-5): the live 3D camera
    // already shows the whole circuit from above there, so the corner map is redundant
    // and, on narrow viewports, was colliding with the wrapped header.
    const miniHidden = c > 4.4;
    if (miniHidden !== lastMiniHidden) { lastMiniHidden = miniHidden; refs.minimapEl.classList.toggle('ov-hide', miniHidden); }
  }
  return { update };
}

function buildCluster(svg: SVGSVGElement): Cluster {
  const rad = (d: number) => (d * Math.PI) / 180;
  const SC: [number, number] = [136, 132], RC: [number, number] = [664, 132];
  const P = (c: [number, number], th: number, r: number): [number, number] => [c[0] + r * Math.cos(rad(th)), c[1] - r * Math.sin(rad(th))];
  const thS = (f: number) => 304 - 250 * f, thR = (f: number) => 236 + 250 * f;
  const poly = (c: [number, number], r: number, fn: (f: number) => number) => { let d = ''; for (let i = 0; i <= 80; i++) { const [x, y] = P(c, fn(i / 80), r); d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); } return d; };
  let h = `<defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14161a" stop-opacity=".94"/><stop offset="1" stop-color="#050607" stop-opacity=".96"/></linearGradient></defs>
    <rect class="rim" x="26" y="22" width="748" height="220" rx="110"/>
    <path class="hl" d="M140 30 H660"/>`;
  const tickSet = (c: [number, number], thf: (f: number) => number, vmax: number, major: number, minorStep: number, lab: number, tag: string) => {
    let s = '';
    for (let v = 0; v <= vmax + 1e-6; v += minorStep) {
      const isM = Math.abs(v / major - Math.round(v / major)) < 1e-6, th = thf(v / vmax);
      const [x0, y0] = P(c, th, isM ? 86 : 92), [x1, y1] = P(c, th, 99);
      s += `<line data-t="${tag}${v}" class="tk${isM ? '' : ' mn'}" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"/>`;
    }
    for (let v = 0; v <= vmax + 1e-6; v += lab) { const [lx, ly] = P(c, thf(v / vmax), 71); s += `<text class="tl${tag === 'r' && v >= 7 ? ' red' : ''}" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${v}</text>`; }
    return s;
  };
  h += tickSet(SC, thS, 320, 40, 10, 40, 's') + tickSet(RC, thR, 8, 1, 0.5, 1, 'r');
  h += `<path class="bandbg" d="${poly(SC, 104, thS)}"/><path class="bandbg" d="${poly(RC, 104, thR)}"/>
    <path id="c-sb" class="band" pathLength="1" stroke-dasharray="0 1" d="${poly(SC, 104, thS)}"/>
    <path id="c-rb" class="band" pathLength="1" stroke-dasharray="0 1" d="${poly(RC, 104, thR)}"/>`;
  const nl = (c: [number, number], th0: number) => { const [x, y] = P(c, th0, 101), [x2, y2] = P(c, th0, 79); return `<line class="needle" x1="${x2.toFixed(1)}" y1="${y2.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; };
  h += `<g id="c-sn">${nl(SC, 304)}</g><g id="c-rn">${nl(RC, 236)}</g>`;
  h += `<text id="c-spd" class="big" x="136" y="141">0</text><text class="u" x="136" y="161" style="text-anchor:middle">km/h</text>
    <text id="c-rpm" class="big r" x="664" y="139">0.0</text><text class="u" x="664" y="160" style="text-anchor:middle">&times;1000 rpm</text>`;
  h += `<line class="div" x1="300" y1="64" x2="300" y2="200"/><line class="div" x1="500" y1="64" x2="500" y2="200"/>`;
  let sg = '', sb = '';
  for (let i = 0; i < 10; i++) { sg += `<rect class="seg" x="314" y="${170 - i * 7.2}" width="9" height="5" rx="1"/>`; sb += `<rect class="seg" x="477" y="${170 - i * 7.2}" width="9" height="5" rx="1"/>`; }
  h += sg + sb + `<text class="lb" x="318" y="186" style="font-size:8px;letter-spacing:.12em">THR</text><text class="lb" x="482" y="186" style="font-size:8px;letter-spacing:.12em">BRK</text>`;
  h += `<text id="c-sec" class="sec" x="400" y="86">S1</text>
    <text id="c-gear" class="gear" x="400" y="148">N</text><text class="lb" x="400" y="165">GEAR</text>`;
  let ty = ''; ([356, 380, 420, 444] as const).forEach((x) => { ty += `<rect class="tyre" x="${x - 5}" y="200" width="10" height="6" rx="1.5"/>`; });
  h += ty + `<text class="lb" x="400" y="220" style="font-size:8px">TYRE TEMP</text><text class="lb" x="400" y="234" style="letter-spacing:.3em;font-size:7px">DEMO TELEMETRY</text>`;
  h += `<circle id="c-wd" class="warnd" cx="664" cy="78" r="4"/><circle id="c-w" class="warn" cx="664" cy="78" r="10"/>`;
  svg.innerHTML = h;
  const q = <T extends SVGElement>(id: string): T => svg.querySelector('#' + id) as T;
  const collect = (tag: string) => [...svg.querySelectorAll(`line[data-t^="${tag}"]`)].map((el) => ({ el: el as SVGElement, v: parseFloat((el as SVGElement).dataset.t!.slice(1)) }));
  const tyres = [...svg.querySelectorAll('.tyre')] as SVGElement[], segs = [...svg.querySelectorAll('.seg')] as SVGElement[];
  return {
    spd: q('c-spd'), rpmT: q('c-rpm'), gear: q('c-gear'), sector: q('c-sec'), sBand: q('c-sb'), rBand: q('c-rb'), sNeedle: q('c-sn'), rNeedle: q('c-rn'), sc: SC, rc: RC,
    sTicks: collect('s'), rTicks: collect('r'), warn: q('c-w'), warnd: q('c-wd'), segT: segs.slice(0, 10), segB: segs.slice(10), tyres, lastS: -9, lastR: -9, lastA: -1,
  };
}
