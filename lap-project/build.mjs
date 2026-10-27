// Builds the prototype into ONE self-contained file: dist/index.html (car.glb and fonts are inlined as base64).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const R = (...p) => path.join(import.meta.dirname, ...p);
const r = await build({ entryPoints: [R('src/main.js')], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020' });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = fs.readFileSync(R('template.html'), 'utf8');
const glb = fs.readFileSync(R('assets/car.glb')).toString('base64');
const face = (pkg, fam, w) => `@font-face{font-family:"${fam}";font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${fs.readFileSync(R('node_modules/@fontsource', pkg, 'files', `${pkg}-latin-${w}-normal.woff2`)).toString('base64')}) format("woff2");}`;
const fonts = [['big-shoulders-display', 'Big Shoulders Display', [800, 900]], ['barlow-semi-condensed', 'Barlow Semi Condensed', [400, 500, 600, 700]], ['saira-condensed', 'Saira Condensed', [600, 700, 800]], ['outfit', 'Outfit', [200, 300]]].map(([p, f, ws]) => ws.map((w) => face(p, f, w)).join('')).join('\n');
fs.mkdirSync(R('dist'), { recursive: true });
fs.writeFileSync(R('dist/index.html'), tpl.replace('/*FONTS*/', () => fonts).replace('/*BUNDLE*/', () => `window.__GLB=${JSON.stringify({ car: glb })};\n${js}`));
console.log('dist/index.html', (fs.statSync(R('dist/index.html')).size / 1048576).toFixed(2), 'MB');
