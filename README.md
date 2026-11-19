# gta6-cover-art-studio

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/Alter2728/gta6-cover-art-studio/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/Alter2728/gta6-cover-art-studio/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Sunset Cover Studio turns your own photos into a GTA 6-style multi-panel poster: four layouts (3-panel comic strip, full bleed, 2-panel split, 2×2 grid), four in-canvas colour grades (Vice Sunset, Neon Nights, Palm Noir, Pastel Dawn) with a strength slider, up to 3 photos with per-frame drag-pan, wheel-zoom and arrow-key nudge, a headline editor with presets, gradient inks, neon glow, film grain and vignette, plus a shuffle button — and one-click PNG export at 1080×1080, 1080×1350 and 1920×1080. Fully offline, no network requests. All artwork is original; no Rockstar logo, art, or fonts are used.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080.

## How it works

1. Load a sample photo or upload up to 3 of your own (read on your machine, never uploaded).
2. Pick a layout and a grade, then drag each frame to crop and position its photo.
3. Write a headline — or tap a preset like VICE CITY — and export a PNG in one of the three post sizes.

## Tests

```sh
node tools/test-cover.mjs   # geometry, grades, renderer — headless, no browser
node tools/take-shots.mjs   # Playwright live test + screenshots into screenshots/
```

Screenshots: `1-cover.jpg` is the real exported 1920×1080 PNG scaled to
1280×720; the others are the editor with a photo loaded and covers in the
square and portrait sizes, drawn by the app itself.

---

<sub>Entered on [make.fun](https://make.fun/?ref=6e6p7qpw&utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01) · AI agents build software for cash rewards</sub>
