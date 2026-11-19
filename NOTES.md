# NOTES — Sunset Cover Studio, round 4 (fresh rebuild)

Built fresh in this recorded session (round 4) from the brief + the kit
starter's patterns. Every source file below was written with the write tool
in this session; the only byte-identical copies from the kit are the MIT
LICENSE, the vendored `vendor/makefun-app.ts`, and the two free-to-use
sample photos (`app/samples/boulevard.jpg`, `app/samples/pier.jpg`).

## What was built

Sunset Cover Studio — a GTA 6-style cover art maker (plain static files
under `app/`, Node 22 stdlib only, no build step, no network at runtime):

- 4 layouts (Sunset Strip, Full Bleed, Split Screen, Four Corners) tiling
  the canvas with gap `max(2, round(min(w,h)*0.008))`, never overlapping.
- Up to 3 user photos, read locally and never uploaded; per-panel crops
  (cover-fit, zoom clamped [1, 4], pan clamped so a photo can never leave
  its frame; drag to pan, scroll to zoom, arrow keys nudge 0.02).
  Frames take turns through the loaded photos.
- 4 colour grades with the exact specified stops/modes/strengths/skies,
  0–100 intensity slider (0 = neutral, no tint), 4 headline inks.
- Headline in bundled Anton, auto-fit to canvas width, editable headline +
  tagline, 4 presets, sun glow, neon rules with a glow slider, seeded
  film grain (mulberry32, seed 7) and vignette — all drawn on canvas.
- Shuffle (random layout + grade + ink + crops) and PNG export in
  1080×1080, 1080×1350, 1920×1080 as `sunset-cover-<WxH>.png`.
- `?scene=` fixed scenes (`cover` full-bleed, `editor` with a photo loaded)
  for the screenshots; favicon is a `data:` URI.

## Font (the round-3/4 fix)

Downloaded fresh in this session from the Google Fonts repo:

- `app/fonts/Anton-Regular.ttf`
  - sha256: `a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab`
  - size: 170812 bytes (matches the expected hash and size)
- `app/fonts/OFL.txt` — 4484 bytes, SIL Open Font License.
- The app loads Anton via `@font-face` from that file and calls
  `document.fonts.load` before drawing, so headline rendering is
  deterministic. No Google Fonts or any other network request at runtime.

## Verification (all run in this session)

- Unit tests: `node tools/test-cover.mjs` — **96 tests, 96 pass, 0 fail**
  (layouts × sizes geometry, crop clamping, headline auto-fit, grades,
  inks, export sizes, renderer vs a fake 2D context, shuffle
  determinism with seeded RNG, scenes).
- Determinism: `MAKEFUN_OUTPUT_DIR=out node main.ts` run twice into
  `out` and `out2`, `diff -r` — **byte-identical**.
- Live test: `node tools/take-shots.mjs` — **LIVE TEST ALL PASSED**:
  editor loads with sample photo, 2nd photo uploads, layout switches
  to grid4, wheel zoom (1.10), drag pan, arrow-key nudge (0.02 step),
  headline preset + edit, all 3 PNG exports with IHDR dimensions
  verified, 0 console errors, 0 failed requests, 0 external requests.
- Screenshots (all ≤ 256 KiB, correct dimensions):
  - `1-cover.jpg` — 1280×720, 153959 bytes (real exported 1920×1080 PNG)
  - `2-editor.jpg` — 1280×720, 112673 bytes (live editor, photo loaded)
  - `3-cover-square.jpg` — 1024×1024, 132048 bytes (real 1080×1080 PNG)
  - `4-cover-portrait.jpg` — 1024×1280, 177127 bytes (real 1080×1350 PNG)
- README badges verified on lines 7–9 verbatim; dossier builds cleanly
  (`out/dossier.json`, 805665 bytes).

## Notes for the coordinator

- Playwright browsers were already installed (chromium-1255 under
  `~/.cache/ms-playwright`); `tools/take-shots.mjs` uses that executable
  when present and falls back to playwright-core's default launch.
  `tools/.pw/` (playwright-core 1.55) is git-ignored and kept.
- No Rockstar Games logo, wordmark, artwork or font anywhere.
- Round-4 commit message: "Sunset Cover Studio round 4 — fresh rebuild,
  font + README re-created in recorded session".
