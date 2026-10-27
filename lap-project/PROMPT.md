# Prompt for the Claude Code agent

Paste everything below the line into Claude Code, run from this project's root.

---

You are porting an existing, working vanilla three.js prototype ("Lap One") to a production-grade **Next.js** app, then applying a list of tweaks. Read `README.md` first, then every file in `src/` and `template.html` before changing anything. The prototype builds with `npm install && npm run build` into `dist/index.html`; open that to see exactly what the finished experience should look and feel like. The visual and motion result must stay identical or better.

## 1. Port to Next.js

- Next.js (current stable, App Router), TypeScript, ESLint. Package manager: npm.
- Keep the imperative three.js engine. Do NOT rewrite it in React Three Fiber unless you can prove identical behaviour; the engine is frame-loop driven and tuned. Wrap it in a single client component (`'use client'`, loaded with `next/dynamic` and `ssr: false`) that owns the canvas, mounts the engine on mount and **fully disposes it on unmount** (cancel rAF, remove every listener, dispose renderer/composer/geometries/materials/textures, close the AudioContext, clear intervals).
- Convert `template.html` into React components + CSS (CSS Modules or a global stylesheet; keep the existing CSS values and class names' behaviour). Components: Loader/Showroom, Header (brand, sector chips, Music and Engine toggles), InstrumentCluster mount, Panels (six sections), Minimap, MobileTelemetry. The panel text animation in `src/panels.js` manipulates DOM directly each frame for smoothness; keep that approach (refs + imperative updates), do not move per-frame values into React state.
- Replace the base64 inlining: serve `assets/car.glb` from `public/models/car.glb` and load it with `GLTFLoader.load` (keep the meshopt decoder). Show real download progress in the loader instead of fake steps. Cache headers: immutable.
- Fonts via `next/font` (Google): Big Shoulders Display (800, 900), Barlow Semi Condensed (400, 500, 600, 700), Saira Condensed (600, 700, 800), Outfit (200, 300). Expose them as the CSS variables the CSS already uses (`--disp`, `--body`, `--num`) and Outfit for the mobile speed digits.
- Remove all `window.*` globals except behind a dev-only test flag (`?test` or `NODE_ENV !== 'production'`): `__forceC`, `__hold`, `__once`, `__wsm`, `__ready`, `__frames`, plus the `#auto` hash that skips the enter screen. Keep them working in dev so `scripts/screenshot_test.py` still runs.
- Split `src/main.js` into typed modules (scroll/camera, post-processing, scene assembly, loader state) without changing behaviour. Add types for the shared state (`drive`, panel update args).
- Metadata: title "Lap One", description, Open Graph/Twitter tags, theme-color, favicon. Provide a static OG image (render a frame of the hero and save it).
- Keep it deployable on Vercel with zero config. Add a `README` section on running, building and deploying.

## 2. Must-preserve behaviour (verify each)

1. Enter screen: circuit draws itself while loading; five start lights fill with progress; when ready it becomes a showroom with the live 3D car swaying behind the title; no page scroll while it is shown; "Enter with sound" / "Without sound".
2. Scroll feel: two critically-damped stages, no stair-stepping; **cruise mode** (after about 0.6 s idle the page drifts forward about 0.07 chapters/second, not on the first screen, not at the end, off with reduced motion).
3. Chapters: hero, S1 Shape (orbit), S2 Air (streamlines + smoke), S3 Brake (glowing discs, sparks), S4 Night (speed streaks, gantries), S5 Flag (overhead, racing-line ribbon, finish burst).
4. Wheels: spin from path distance, steer from curvature, motion-blur disc fades in with spin rate, brake heat glow.
5. Mirror reflection of the car in the asphalt (stencil-cut ground).
6. Instrument cluster: twin concentric dials in a dark housing, white/yellow/red palette only (no blue), needles ride the scale, centre read-out (sector, gear, throttle/brake, tyre bars), shift/redline warning. Concentricity with the housing's end curves must stay pixel-exact at every width.
7. Audio: synthesized V8 that follows scroll speed, upshift/downshift pops, lift-off crackle, **engine-off shutdown sound**, tyre and wind noise, trap loop, Engine and Music toggles, auto engine-off at the flag (and restart if the user scrolls back up), pause when the tab is hidden.
8. Lap timer: starts when the user pulls away, stops at the flag, shown as m:ss.mmm on the final screen. Resets on replay.
9. Final screen: readable card over the overhead track, "Designed and built by David Ejere", GitHub (https://github.com/davedumto) and email (ejeredavid2001@gmail.com) links, one-line independent-design-study note.
10. Mobile (about 390 px wide): compact gear+speed readout, header fits, text clears the car, enter screen centred.

## 3. Quality work to do as part of the port

- Replace `ScriptProcessorNode` with an `AudioWorklet` (keep the DSP identical; load the worklet from `public/`).
- Quality tiers: detect GPU/device (pixel ratio cap, MSAA samples, bloom on/off, smoke particle count, shadow/mirror toggle) and auto-downgrade if the frame time stays above 22 ms for 2 s.
- Respect `prefers-reduced-motion` (no cruise, softer reveals) and make the Music/Engine toggles keyboard accessible (they already are buttons; check focus order and `aria-pressed`).
- Fix anything that fails `next build`, `tsc --noEmit` and `eslint` with no suppressed errors.
- Verify with `scripts/screenshot_test.py` (software GL, adapt the port/URL) at 1280x720 and 390x844 for c = 0, 1.2, 2.4, 3.15, 4.2, 5, and the enter screen. Fix visual regressions against the prototype's `dist/index.html`.

## 4. Tweaks (apply after the port works)

<!-- David: write your tweaks here, one per line. Examples of things to consider:
- Swap the synthesized engine for a licensed V8 recording crossfaded by rpm (I will supply files).
- Replace the trap loop with a licensed track (I will supply the file).
- Add the final model credit once I confirm the Sketchfab licence.
-->

## Rules

- Do not add any date/author byline anywhere except the footer credit described above.
- Keep the palette: near-black, white, signal yellow #ffd23f, red #ff4a3d. No new colours.
- Do not introduce brand names or logos in copy.
- Commit in small steps. After each step run `npm run build` and fix errors before continuing. At the end, summarise what changed and anything you could not verify (real-GPU performance, audio quality).
