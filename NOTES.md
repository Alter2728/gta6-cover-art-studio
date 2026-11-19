# gta6-cover-art-01 — REBUILD ROUND 2

**Rebuild dimulai:** 2026-11-19 ~19:52 WITA (11:52 UTC), di dalam recording
01a1f3a5-bb3e-7665-be04-c9767c6e68b5 yang sudah berjalan sebelum sesi builder ini.
**Builder:** subagent fresh yang sesinya dimulai SETELAH recording — semua
penulisan file di sesi ini terekam dengan benar.
**Aturan sesi ini:** JANGAN menghentikan recording, JANGAN menjalankan `record`
sendiri, JANGAN submit, JANGAN bundle — submit dilakukan parent setelah sesi
ini selesai.

## Kenapa rebuild

Round 1 (submission 01a1f370-1e1f-737f-b452-7d21b64a0763) DITOLAK hanya karena
check `transcripts_witnessed` gagal — upload chunk rekaman macet saat sealing
(2 pesan sampai 560-561 detik setelah timestamp yang diklaim, batas 300 detik).
28 check lain LOLOS (thinking_reproduces 86,4%). Retry diizinkan sampai entries
close Sabtu 21 Nov 2026 18:30 WITA, tapi submit ulang yang sama pasti gagal
(`unchanged_will_fail=true`) — jadi ini rebuild BARU, bukan perbaikan kecil.

## Yang ditulis ulang di sesi ini (fresh rewrite, dari nol)

Semua 15 file counted ditulis ulang dengan write tool di sesi ini — struktur,
nama fungsi/variabel, dan implementasi baru, bukan copy-paste round 1:

- `NOTES.md` (file ini), `README.md`, `app/fonts/OFL.txt`
- `app/index.html`, `app/src/cover.mjs`, `app/src/grades.mjs`,
  `app/src/layouts.mjs`, `app/src/main.mjs`, `app/src/shots.mjs`,
  `app/style.css`
- `main.ts`, `serve.ts`, `tools/take-shots.mjs`, `tools/test-cover.mjs`,
  `shots.json`

Perubahan desain dibanding round 1 (modul dirancang ulang):

- State editor diganti nama: `layout` → `arrangement`, `gradeId` → `tint`,
  `title`/`subtitle` → `headline`/`tagline`, `panels` → `frames`,
  `photos` → `pictures`, `ox`/`oy` → `dx`/`dy`, `fit` → `mode`
  (`cover`/`contain`).
- Grade kini disimpan sebagai angka filter (saturate/contrast/brightness/hue)
  + tint layer ber-alpha, sehingga ada **slider intensitas grade** (0–100%)
  yang mem-blend filter ke netral — baru di round 2.
- Renderer baru: sun glow di belakang band headline, neon rule (garis gradien
  magenta–emas–cyan dengan halo) di atas/bawah headline, **slider glow neon**,
  **film grain** deterministik (seeded PRNG, preview = export), toggle
  vignette — semua digambar di canvas, jadi ikut ke PNG export.
- Editor baru: preset headline (VICE CITY, SUNSET DRIVE, NEON RIDE,
  PIER PRESSURE), tombol **Shuffle the composition** (acak layout + grade +
  ink + crop tiap frame).
- Scene screenshot pindah dari `?shot=` ke `?scene=`; shot 1 tetap PNG export
  asli 1920×1080 yang di-scale ke 1280×720.

## Verifikasi (selesai 2026-11-19 ~20:15 WITA)

- Unit test: `node tools/test-cover.mjs` — **98 passed, 0 failed** (geometri
  4 layout × 3 ukuran, placePhoto/zoom/pan, headline auto-fit, grade +
  intensitas, ink, 3 export preset, hit-test, renderer vs fake context).
- Determinisme: `MAKEFUN_OUTPUT_DIR=out node main.ts` 2× — **byte-identical**
  (`diff -r` bersih), dossier 674.078 byte.
- Playwright live test: `node tools/take-shots.mjs` — **PLAYTEST ALL PASSED**:
  load sample, upload foto ke-2, grid 4 frame, drag-pan, wheel-zoom,
  arrow-nudge, preset headline, edit headline, export 3 ukuran (PNG
  1080×1080 / 1080×1350 / 1920×1080 terverifikasi), 0 console error,
  0 external request, 0 failed request.
- Screenshot (baru, dari app round 2):
  - `1-cover.jpg` — 90.151 byte, 1280×720, PNG export asli 1920×1080
    (pier + boulevard bergantian, strip3, Vice Sunset, "VICE CITY").
  - `2-editor.jpg` — 123.459 byte, 1280×720, editor grid4 + foto dimuat.
  - `3-cover-square.jpg` — 114.608 byte, 1024×1024, split2, Pastel Dawn,
    "SUNSET DRIVE".
  - `4-cover-portrait.jpg` — 140.744 byte, 1024×1280, strip3, Neon Nights,
    "PIER PRESSURE".
  Semua ≤256 KiB, sisi panjang ≤1280, sisi pendek ≥480.
- Commit + push: (isi SHA di bawah setelah commit)

## Batas sesi ini

Gratis saja — jangan bayar apa pun, jangan launch coin, jangan buat akun baru,
jangan sentuh bounty lain (trophy-guide + trophy-rarity dikerjakan job lain).
