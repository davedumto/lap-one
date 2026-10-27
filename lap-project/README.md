# Lap One (prototype)

A scroll-driven 3D film of a GT3 race car taking one lap of a procedural night circuit. Vanilla JS + three.js 0.160, bundled by esbuild into a single self-contained HTML file.

    npm install
    npm run build        # -> dist/index.html (open it directly in a browser)

## Layout

- `template.html`  page shell: all CSS, loader/showroom, header, instrument cluster mount, text panels. Contains `/*FONTS*/` and `/*BUNDLE*/` placeholders that `build.mjs` fills.
- `assets/car.glb`  optimised car (meshopt + webp, ~5 MB, ~156k tris). Y-up, +X is forward, +Z is the car's right. Original is not included.
- `src/main.js`  engine: renderer, post (bloom, chromatic aberration, warp blur, grain), spring-damped scroll (two critically-damped stages), camera key table, per-frame orchestration, loader/showroom, lap timer, cruise mode, auto engine-off.
- `src/util.js`  smoothDamp, PCHIP, spline rows, easing.
- `src/track.js`  closed CatmullRom circuit (arc-length param), road, edge lines, gantries, start line, minimap path.
- `src/car.js`  GLB load, wheel splitting (tyre/rim/disc per wheel pivots), mirror clone, PMREM studio environment, motion-blur discs and brake heat discs.
- `src/scenery.js`  stencil-cut ground (mirror shows through asphalt), kerbs, gravel, tyre walls, skid marks, lamp posts with light pools, catch fencing, bridges, floodlights.
- `src/world.js`  sky dome, deep ground, barriers, distant skyline blocks.
- `src/fx.js`  wind streamlines, smoke wisps, speed streaks, sparks, start lights, racing-line ribbon.
- `src/panels.js`  text panels (split-word reveals driven by scroll), sector chips, minimap, twin-dial instrument cluster (SVG).
- `src/drive.js`  shared powertrain model: speed -> gear, revs, throttle, brake.
- `src/audio.js`  WebAudio: synthesized V8 (per-cylinder pressure pulses through exhaust resonators, ScriptProcessor), shifts/pops, shutdown, tyre/wind, synthesized trap loop.
- `scripts/screenshot_test.py`  Playwright harness (software GL). Uses hooks: `window.__forceC`, `window.__hold`, `window.__once`, `window.__wsm`, `window.__ready`, `window.__frames`, and `#auto` in the URL to skip the enter screen.

## Core ideas to preserve

- Everything is driven by one smoothed progress value `c` in [0, 5]; text, camera, car, HUD and audio all read it.
- Text panels are `position: fixed`, placed from `c` (not native scroll), so type and 3D move as one.
- Page height is a 780vh spacer; native scroll only provides the input.

## Known gaps

- Car model is a Sketchfab asset: confirm licence/credit before publishing. Its livery contains real third-party graphics; the page is framed as an independent design study.
- Audio is fully synthesized (no samples). A real V8 recording crossfaded by rpm would sound better.
- ScriptProcessorNode is deprecated; an AudioWorklet port is advisable.
- Performance on real GPUs and low-end phones is untested (quality tiers needed).
