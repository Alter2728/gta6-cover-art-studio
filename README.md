# Sunset Cover Studio

A GTA 6-style cover art maker for the make.fun bounty
[gta6-cover-art-01](https://make.fun/bounty/gta6-cover-art-01) — built for
[@altertera28](https://make.fun/u/altertera28).

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/Alter2728/gta6-cover-art-studio/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/Alter2728/gta6-cover-art-studio/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

## What it does

Load up to 3 of your own photos (read on your machine, never uploaded),
arrange them in 4 panel layouts — **Sunset Strip**, **Full Bleed**,
**Split Screen**, **Four Corners** — crop each panel by dragging to pan,
scrolling to zoom, or nudging with the arrow keys, then grade the poster
with one of 4 sunset/neon colour grades, set the headline in Anton, and
export a PNG to share.

- **4 layouts**, per-panel pan / zoom / nudge, 2 photos alternating across panels
- **4 colour grades** (Vice Sunset, Pastel Dawn, Neon Nights, Palm Gold) with a
  0–100% intensity slider that blends the grade back to neutral
- **Sun glow** behind the headline band, **neon rules** (magenta–gold–cyan
  gradient lines with a halo) above and below it, with a glow slider
- **Deterministic film grain** (seeded PRNG — preview and export match) and a
  **vignette** toggle, all drawn on the canvas so they reach the PNG
- **Headline editor** with auto-fit, 4 presets (VICE CITY, SUNSET DRIVE,
  NEON RIDE, PIER PRESSURE), 4 ink colours, and a **Shuffle the composition**
  button (random layout + grade + ink + crops)
- **Export PNG** in 1080×1080, 1080×1350 and 1920×1080

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network request at run time: every script, font and sample
image is a file under `app/`. The Anton font is bundled under
`app/fonts/` under the SIL Open Font License (`app/fonts/OFL.txt`).
No Rockstar Games logo, wordmark, artwork or font is used anywhere.

## Tests

```sh
node tools/test-cover.mjs   # unit tests (pure geometry, grades, renderer)
node tools/take-shots.mjs   # Playwright live test + screenshots
```

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `app/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library
(`vendor/makefun-app.ts`).

## Layout

```
app/
  index.html          the editor page
  style.css           dusk-purple editor shell
  src/
    main.mjs          wiring: photos, controls, canvas gestures, export
    cover.mjs         the renderer (frames, grade, glow, neon, grain, type)
    grades.mjs        the 4 grades, inks and export sizes
    layouts.mjs       panel geometry, photo placement, pan/zoom/nudge
    shots.mjs         ?scene= fixed scenes for screenshots
  fonts/Anton-Regular.ttf   (SIL OFL 1.1, see OFL.txt)
  samples/            two CC0-style sample photos from the kit
main.ts               hands app/ + screenshots/ in as /output + dossier.json
serve.ts              tiny static server for trying the app locally
tools/
  test-cover.mjs      unit tests
  take-shots.mjs      Playwright live test + screenshot maker
shots.json            the four screenshots and their scenes
screenshots/          1-cover.jpg (the cover), 2-editor.jpg, 3/4-cover-*.jpg
```

## License

MIT — see `LICENSE`.
