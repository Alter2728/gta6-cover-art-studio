# Sunset Cover Studio

A GTA 6-style cover art maker for the make.fun bounty
[gta6-cover-art-01](https://make.fun/bounty/gta6-cover-art-01) — built for
[@altertera28](https://make.fun/u/altertera28).

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/Alter2728/gta6-cover-art-studio/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/Alter2728/gta6-cover-art-studio/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Upload up to 3 of your own photos, arrange them in panels, grade them like
a Vice City sunset, write a bold headline, and export a cover to share.

## What it does

- **4 layouts**: Sunset Strip (3 horizontal strips), Full Bleed (1 frame),
  Split Screen (2 vertical halves), Four Corners (2×2 grid). Frames tile
  the canvas with a thin gap and never overlap.
- **Per-panel crops**: cover-fit placement, zoom clamped to [1, 4], pan
  clamped so a photo can never be dragged off its frame. Drag to pan,
  scroll to zoom, arrow keys nudge in 0.02 steps. Frames take turns
  through your loaded photos, so 2 photos alternate across the panels.
- **4 colour grades**: Vice Sunset, Pastel Dawn, Neon Nights and Palm Gold,
  each with its own three-stop wash, blend mode and strength. A 0–100
  intensity slider blends the wash from neutral (no tint at all) to full.
- **Headline**: Anton type, auto-fit to the canvas width, editable headline
  and tagline, 4 presets (VICE CITY, SUNSET DRIVE, NEON RIDE, PIER PRESSURE)
  and 4 inks (White, Gold, Neon Pink, Midnight) with matching shadows.
- **Effects**: a sun glow behind the headline band, neon rules (magenta–
  gold–cyan gradient lines with a halo) above and below the headline with a
  glow slider, deterministic seeded film grain (seed 7 — preview and export
  draw identical specks) and a vignette toggle. Everything is drawn on the
  canvas, so it all reaches the exported PNG.
- **Shuffle**: one click picks a random layout, grade, ink and crops.
- **Export PNG** in 1080×1080, 1080×1350 and 1920×1080, as
  `sunset-cover-<WxH>.png`.

## How to run

```sh
node serve.ts
```

Then open <http://localhost:8080>. No build step, no network request at
runtime: every script, font and sample photo is a file under `app/`, and
your photos are read on your own machine and never uploaded. The headline
font is Anton under the SIL Open Font License, bundled in `app/fonts/`
with its `OFL.txt`.

## Tests

```sh
node tools/test-cover.mjs   # unit tests: layouts, crops, grades, renderer, scenes
node tools/take-shots.mjs   # live Playwright test + the 4 screenshots
```

## Hand-in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `app/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library.

## File layout

```text
app/
  index.html            the editor page
  style.css             dusk-purple shell, Anton @font-face
  fonts/
    Anton-Regular.ttf   headline font (SIL OFL, see OFL.txt)
    OFL.txt
  samples/
    boulevard.jpg       free-to-use sample photo
    pier.jpg            free-to-use sample photo
  src/
    cover.mjs           the renderer: frames, grade wash, sun glow,
                        neon rules, seeded grain, vignette, headline
    grades.mjs          GRADES, INKS, EXPORT_SIZES and lookups
    layouts.mjs         LAYOUTS, frameRects, crops, shuffle picks
    main.mjs            wiring: photos, controls, gestures, export
    shots.mjs           ?scene= fixed scenes for screenshots
main.ts                 hands the app in (copies app/ + screenshots/,
                        writes dossier.json)
serve.ts                tiny static server for app/ on :8080
shots.json              the 4 screenshot scenes
tools/
  test-cover.mjs        unit tests
  take-shots.mjs        live Playwright test + screenshot maker
screenshots/            the 4 screenshots (first is the cover)
```

## License

MIT — see [LICENSE](LICENSE). No Rockstar Games logo, wordmark, artwork
or font is used anywhere in this app.
