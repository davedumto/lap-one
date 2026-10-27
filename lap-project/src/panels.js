import { clamp, lerp, sstep, easeOut } from './util.js';
import { LENGTH } from './track.js';

const WIN = [[-9, 0.5], [0.62, 1.95], [2.05, 2.8], [2.88, 3.55], [3.7, 4.6], [4.72, 9]];
const ENTER = 0.3, EXIT = 0.24;

function splitWords(h, chars) {
  const txt = h.textContent.trim(); h.setAttribute('aria-label', txt); h.textContent = '';
  const out = [];
  const mk = (s) => { const w = document.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true'); const i = document.createElement('span'); i.className = 'wi'; i.textContent = s; w.appendChild(i); h.appendChild(w); out.push(i); };
  if (chars) { for (const ch of txt) { if (ch === ' ') { const s = document.createElement('span'); s.className = 'sp'; h.appendChild(s); } else mk(ch); } }
  else txt.split(/\s+/).forEach((wd, i, arr) => { mk(wd); if (i < arr.length - 1) h.appendChild(document.createTextNode(' ')); });
  return out;
}

export function initPanels({ go }) {
  const panels = [...document.querySelectorAll('.panel')].map((el, i) => {
    const copy = el.querySelector('.copy'), h = el.querySelector('h1,h2');
    const words = splitWords(h, h.hasAttribute('data-split-chars'));
    const nm = el.querySelector('.tag .nm'); const segs = [...el.querySelectorAll('.segs i')];
    const fx = [...el.querySelectorAll('.fx')];
    return { el, copy, words, nm, segs: segs.length ? segs : null, fx, num: el.querySelector('.numeral'), i };
  });
  document.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(+a.dataset.go === 0 ? 0 : 1); }));
  const chips = [...document.querySelectorAll('#chips a')];
  const CT = [0, 1.0, 2.3, 3.2, 4.2, 5];
  chips.forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); const h = a.getAttribute('href'); const n = h === '#s0' ? 0 : +h.slice(2); go(CT[n]); }));
  document.getElementById('home').addEventListener('click', (e) => { e.preventDefault(); go(0); });

    const cl = buildCluster(document.getElementById('clu'));
  const mg = document.getElementById('mg'), ms = document.getElementById('ms');
  const mmPg = document.getElementById('mm-pg'), mmDot = document.getElementById('mm-dot'), mmD = document.getElementById('mm-d');
  let lastGear = '', lastActive = -1;
  const SECN = ['Start', 'Shape', 'Air', 'Brake', 'Night', 'Flag'];

  function update({ c, mob, u, kmh, drive, mm, at, prog, now }) {
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
      if (p.nm) p.nm.style.opacity = easeOut(clamp((ee - 0.05) / 0.4)) * (1 - xe);
      if (p.segs) { const pr = clamp((c - a) / (b - a)); p.segs.forEach((sg, k) => sg.classList.toggle('on', pr >= (k + 0.25) / 3)); }
      if (p.num) {
        const mid = (a + b) / 2;
        p.num.style.opacity = (easeOut(e) * (1 - xe)).toFixed(3);
        p.num.style.transform = `translate3d(${((mid - c) * -70).toFixed(1)}px,${((1 - easeOut(e)) * 60).toFixed(1)}px,0)`;
      }
    });
    if (active !== lastActive) {
      lastActive = active;
      chips.forEach((a, i) => { if (i === active || (i === 0 && active === 0)) a.setAttribute('data-on', ''); else a.removeAttribute('data-on'); });
    }
    // chips: first chip (Start, index 0) is hidden on mobile; indices map S1..S5 to 1..5
    chips.forEach((a, i) => { if (i < active) a.setAttribute('data-done', ''); else a.removeAttribute('data-done'); });

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
    const wv = rr > 0.88 && (Math.floor(now / 90) % 2 === 0) ? 1 : 0; cl.warn.style.opacity = wv; cl.warnd.style.opacity = wv;
    cl.segT.forEach((s, i) => s.classList.toggle('on', i < Math.round(clamp(drive.thr) * 10)));
    cl.segB.forEach((s, i) => s.classList.toggle('onb', i < Math.round(clamp(drive.brk) * 10)));
    cl.sector.textContent = 'S' + Math.max(1, active) + ' \u00b7 ' + SECN[active];
    if (active !== cl.lastA) { cl.lastA = active; }
    const heat = clamp(kmh / 320) * 0.6 + clamp(drive.brk) * 0.4;
    cl.tyres.forEach((tr, i) => { const h = 6 + 16 * clamp(heat * (0.8 + 0.12 * i)); tr.setAttribute('height', h.toFixed(1)); tr.setAttribute('y', (206 - h).toFixed(1)); });
    // minimap
    mmPg.setAttribute('stroke-dasharray', `${prog.toFixed(4)} 1`);
    const [mx, my] = mm.map(at(u).p); mmDot.setAttribute('cx', mx.toFixed(1)); mmDot.setAttribute('cy', my.toFixed(1));
    mmD.textContent = String(Math.round(u * LENGTH)).padStart(4, '0');
  }
  return { update };
}


function buildCluster(svg) {
  const rad = (d) => (d * Math.PI) / 180;
  const SC = [136, 132], RC = [664, 132];
  const P = (c, th, r) => [c[0] + r * Math.cos(rad(th)), c[1] - r * Math.sin(rad(th))];
  const thS = (f) => 304 - 250 * f, thR = (f) => 236 + 250 * f;
  const poly = (c, r, fn) => { let d = ''; for (let i = 0; i <= 80; i++) { const [x, y] = P(c, fn(i / 80), r); d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); } return d; };
  let h = `<defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14161a" stop-opacity=".94"/><stop offset="1" stop-color="#050607" stop-opacity=".96"/></linearGradient></defs>
    <rect class="rim" x="26" y="22" width="748" height="220" rx="110"/>
    <path class="hl" d="M140 30 H660"/>`;
  const tickSet = (c, thf, vmax, major, minorStep, lab, tag) => {
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
  const nl = (c, th0) => { const [x, y] = P(c, th0, 101), [x2, y2] = P(c, th0, 79); return `<line class="needle" x1="${x2.toFixed(1)}" y1="${y2.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; };
  h += `<g id="c-sn">${nl(SC, 304)}</g><g id="c-rn">${nl(RC, 236)}</g>`;
  h += `<text id="c-spd" class="big" x="136" y="141">0</text><text class="u" x="136" y="161" style="text-anchor:middle">km/h</text>
    <text id="c-rpm" class="big r" x="664" y="139">0.0</text><text class="u" x="664" y="160" style="text-anchor:middle">&times;1000 rpm</text>`;
  h += `<line class="div" x1="300" y1="64" x2="300" y2="200"/><line class="div" x1="500" y1="64" x2="500" y2="200"/>`;
  let sg = '', sb = '';
  for (let i = 0; i < 10; i++) { sg += `<rect class="seg" x="314" y="${170 - i * 7.2}" width="9" height="5" rx="1"/>`; sb += `<rect class="seg" x="477" y="${170 - i * 7.2}" width="9" height="5" rx="1"/>`; }
  h += sg + sb + `<text class="lb" x="318" y="186" style="font-size:8px;letter-spacing:.12em">THR</text><text class="lb" x="482" y="186" style="font-size:8px;letter-spacing:.12em">BRK</text>`;
  h += `<text id="c-sec" class="sec" x="400" y="86">S1</text>
    <text id="c-gear" class="gear" x="400" y="148">N</text><text class="lb" x="400" y="165">GEAR</text>`;
  let ty = ''; [356, 380, 420, 444].forEach((x) => { ty += `<rect class="tyre" x="${x - 5}" y="200" width="10" height="6" rx="1.5"/>`; });
  h += ty + `<text class="lb" x="400" y="220" style="font-size:8px">TYRE TEMP</text><text class="lb" x="400" y="234" style="letter-spacing:.3em;font-size:7px">DEMO TELEMETRY</text>`;
  h += `<circle id="c-wd" class="warnd" cx="664" cy="78" r="4"/><circle id="c-w" class="warn" cx="664" cy="78" r="10"/>`;
  svg.innerHTML = h;
  const q = (id) => svg.querySelector('#' + id);
  const collect = (tag) => [...svg.querySelectorAll(`line[data-t^="${tag}"]`)].map((el) => ({ el, v: parseFloat(el.dataset.t.slice(1)) }));
  const tyres = [...svg.querySelectorAll('.tyre')], segs = [...svg.querySelectorAll('.seg')];
  return { spd: q('c-spd'), rpmT: q('c-rpm'), gear: q('c-gear'), sector: q('c-sec'), sBand: q('c-sb'), rBand: q('c-rb'), sNeedle: q('c-sn'), rNeedle: q('c-rn'), sc: SC, rc: RC,
    sTicks: collect('s'), rTicks: collect('r'), warn: q('c-w'), warnd: q('c-wd'), segT: segs.slice(0, 10), segB: segs.slice(10), tyres, lastS: -9, lastR: -9, lastA: -1 };
}
