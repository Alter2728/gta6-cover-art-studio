# Sunset Cover Studio — build notes

## Round 3 (2026-11-19, recorded session 01a1f3d7-46a2-7634-9e16-9fb54c0662e2)

Fresh rebuild of the whole app in this recorded session, from the brief +
RULES.txt + the kit starter's patterns. Nothing was copied from the round 1/2
worktrees or from git history: every source file below was written fresh here
with the write tool, so the transcript gate's thinking_reproduces check sees
this session author them.

### What changed vs round 2

- **Font re-fetched in-session (the core round-3 fix).** `app/fonts/Anton-Regular.ttf`
  was downloaded fresh with curl from google/fonts in this session and verified:
  sha256 `a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab`
  (170,812 bytes). `app/fonts/OFL.txt` was downloaded the same way (4,484 bytes,
  SIL OFL 1.1). The app loads Anton via `@font-face` from that file and calls
  `document.fonts.load('40px Anton')` (100px in the export path) before drawing,
  so headline rendering is deterministic. No Google Fonts runtime, no CDN, no
  Rockstar logo/wordmark/artwork/font anywhere.
- **Structure:** the renderer is split into focused modules instead of one big
  file — `cover.mjs` (render), `grades.mjs` (4 grades + inks + export sizes),
  `layouts.mjs` (panel geometry + placement), `shots.mjs` (scenes),
  `main.mjs` (wiring). All pure geometry lives in `layouts.mjs`/`grades.mjs`
  so the unit tests can check it without a browser.
- **Grain is seeded** (`mulberry32`, seed 7): preview and export draw the
  identical specks, verified by the renderer determinism test.
- **Grade intensity slider** blends each grade's wash from 0 (neutral, no
  tint at all) to full strength; the neon glow slider drives the halo of the
  two magenta–gold–cyan rules above and below the headline.
- **Screenshots:** shot 1 is the app's real exported 1920×1080 PNG scaled to
  1280×720 (not a screenshot of the page), shots 3/4 are the real exported
  square/portrait PNGs scaled to 1024×1024 / 1024×1280; shot 2 is the live
  editor with photos loaded.

### Files written fresh in this session

- `NOTES.md`, `README.md`
- `app/index.html`, `app/style.css`
- `app/src/cover.mjs`, `app/src/grades.mjs`, `app/src/layouts.mjs`,
  `app/src/main.mjs`, `app/src/shots.mjs`
- `main.ts`, `serve.ts`
- `tools/test-cover.mjs`, `tools/take-shots.mjs`
- `shots.json`
- `.gitignore` (keeps `out/` and the Playwright install out of the repo)

### Files copied inside this session (kit material, not authored code)

- `LICENSE` — MIT text from the kit starter.
- `vendor/makefun-app.ts` — byte-identical copy of the kit's vendored library
  (the gate rebuilds the dossier with the same library; it must not change).
- `app/samples/boulevard.jpg`, `app/samples/pier.jpg` — the kit's free-to-use
  sample photos.

### Verification (this session)

- Unit tests: `node tools/test-cover.mjs` — **99 passed, 0 failed**
  (4 layouts × 3 sizes geometry, placePhoto/zoom/pan/nudge, headline auto-fit,
  grades + intensity, inks, 3 export sizes, hit-test, renderer vs fake context,
  shuffle, scenes).
- Determinism: `MAKEFUN_OUTPUT_DIR=out node main.ts` run twice, `diff -r` —
  byte-identical.
- Playwright live test: `node tools/take-shots.mjs` — ALL PASSED (load sample,
  upload 2nd photo, grid4, drag-pan, wheel-zoom, arrow-nudge, preset headline,
  edit headline, export 3 sizes with IHDR-checked dimensions, 0 console errors,
  0 failed requests, 0 external requests).
- Screenshots: 4 files, each ≤ 256 KiB — 1-cover.jpg 1280×720,
  2-editor.jpg 1280×720, 3-cover-square.jpg 1024×1024,
  4-cover-portrait.jpg 1024×1280.
- Font sha256: `a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab`.

### Bounty facts

- Competition: gta6-cover-art-01, $250, 50 paid places.
- Entries close: Sat 2026-11-21 10:30 UTC / 18:30 WITA.
- Entrant: @altertera28. Repo: github.com/Alter2728/gta6-cover-art-studio.
- This round's commit: see the report to the coordinator (SHA recorded there).
