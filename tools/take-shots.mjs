// Live test + screenshot maker for Sunset Cover Studio (Node 22 stdlib +
// playwright-core from tools/.pw/node_modules). Serves app/ locally, drives
// the real editor in headless Chromium (upload, layout switch, drag-pan,
// wheel-zoom, arrow-nudge, preset, headline edit, all 3 PNG exports with
// IHDR checks), asserts 0 console errors, 0 failed requests and 0 external
// requests, then produces the 4 screenshots from shots.json, each a JPEG
// at most 256 KiB at the size shots.json names.
// Run: node tools/take-shots.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('./.pw/node_modules/playwright-core');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = JSON.parse(readFileSync(join(ROOT, 'shots.json'), 'utf8'));
const PORT = 8091;
const BASE = `http://127.0.0.1:${PORT}`;
const MAX_SHOT_BYTES = 262144;

const failures = [];
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
}

/** The PNG dimensions from a data URL, read from its IHDR chunk. */
function pngSize(dataUrl) {
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bytes: buf.length };
}

/** The JPEG dimensions from a file, read from its SOF0/SOF2 marker. */
function jpegSize(file) {
  const buf = readFileSync(file);
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error(`${file}: not a JPEG`);
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  throw new Error(`${file}: no SOF marker`);
}

async function waitForServer(tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('serve.ts did not come up');
}

async function main() {
  const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  try {
    await waitForServer();

    const exe = join(process.env.HOME ?? '', '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome');
    const browser = await chromium.launch({
      ...(existsSync(exe) ? { executablePath: exe } : {}),
      args: ['--no-sandbox'],
    });
    try {
      const consoleErrors = [];
      const failedRequests = [];
      const externalRequests = [];
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(String(err)));
      page.on('requestfailed', (req) => failedRequests.push(`${req.url()} ${req.failure()?.errorText ?? ''}`));
      page.on('response', (res) => {
        if (res.status() >= 400) failedRequests.push(`${res.url()} HTTP ${res.status()}`);
      });
      page.on('request', (req) => {
        const url = req.url();
        if (!url.startsWith(BASE) && !url.startsWith('data:') && !url.startsWith('blob:')) externalRequests.push(url);
      });

      // ---- live test on the editor -------------------------------------
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__sunset !== undefined, null, { timeout: 15000 });
      await page.waitForTimeout(800);
      check('editor loads with a sample photo', (await page.textContent('#photo-count'))?.includes('1 / 3'));

      // Upload a 2nd photo (the other bundled sample).
      await page.setInputFiles('#photos', join(ROOT, 'app/samples/boulevard.jpg'));
      await page.waitForFunction(() => document.getElementById('photo-count').textContent.includes('2 / 3'), null, { timeout: 10000 });
      check('second photo uploads (2 / 3 photos)', true);

      // Switch to the Four Corners layout.
      await page.click('[data-layout="grid4"]');
      check('layout switches to grid4', (await page.evaluate(() => window.__sunset.state.layout)) === 'grid4');

      // Wheel-zoom the selected panel, then drag-pan it.
      const box = await page.locator('#cover').boundingBox();
      const cx = box.x + box.width * 0.25;
      const cy = box.y + box.height * 0.25;
      await page.mouse.move(cx, cy);
      await page.mouse.click(cx, cy);
      await page.mouse.wheel(0, -240);
      const zoomed = await page.evaluate(() => window.__sunset.state.crops[window.__sunset.state.selected].zoom);
      check('wheel zooms the selected panel', zoomed > 1, `zoom=${zoomed.toFixed(2)}`);
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 40, cy + 25, { steps: 8 });
      await page.mouse.up();
      const panned = await page.evaluate(() => {
        const s = window.__sunset.state;
        const c = s.crops[s.selected];
        return { ox: c.ox, oy: c.oy };
      });
      check('drag pans the selected panel', panned.ox !== 0 || panned.oy !== 0, `ox=${panned.ox.toFixed(3)} oy=${panned.oy.toFixed(3)}`);

      // Arrow keys nudge the crop by the 0.02 step. (The drag already
      // panned to the zoom-1.1 clamp in +x, so nudge left, which is free.)
      await page.locator('#cover').focus();
      const before = await page.evaluate(() => window.__sunset.state.crops[window.__sunset.state.selected].ox);
      await page.keyboard.press('ArrowLeft');
      const after = await page.evaluate(() => window.__sunset.state.crops[window.__sunset.state.selected].ox);
      check('arrow key nudges the crop', Math.abs(after - before + 0.02) < 0.001, `ox ${before.toFixed(3)} -> ${after.toFixed(3)}`);

      // Headline preset, then an edited headline.
      await page.click('[data-preset="NEON RIDE"]');
      check('headline preset applies', (await page.evaluate(() => window.__sunset.state.headline)) === 'NEON RIDE');
      await page.fill('#headline', 'VICE CITY');
      check('headline edit applies', (await page.evaluate(() => window.__sunset.state.headline)) === 'VICE CITY');

      // All three exports: real PNGs at the right dimensions.
      for (const [w, h] of [[1080, 1080], [1080, 1350], [1920, 1080]]) {
        const dataUrl = await page.evaluate(([ew, eh]) => window.__sunset.exportPng(ew, eh), [w, h]);
        const size = pngSize(dataUrl);
        check(`export PNG ${w}x${h}`, size.w === w && size.h === h, `${size.bytes} bytes`);
      }

      // ---- screenshots from shots.json ----------------------------------
      const shotsDir = join(ROOT, 'screenshots');
      mkdirSync(shotsDir, { recursive: true });
      for (const shot of SHOTS) {
        const url = `${BASE}/${shot.query}`;
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 15000 });
        await page.waitForTimeout(400);
        const out = join(shotsDir, shot.name);
        if (shot.scene === 'cover') {
          const dataUrl = await page.evaluate(([ew, eh]) => window.__sunset.exportPng(ew, eh), [shot.export.w, shot.export.h]);
          const size = pngSize(dataUrl);
          check(`${shot.name}: source export is ${shot.export.w}x${shot.export.h}`, size.w === shot.export.w && size.h === shot.export.h);
          const jpeg = await page.evaluate(async ({ src, w, h }) => {
            const img = new Image();
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = src;
            });
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            return c.toDataURL('image/jpeg', 0.85);
          }, { src: dataUrl, w: shot.w, h: shot.h });
          writeFileSync(out, Buffer.from(jpeg.split(',')[1], 'base64'));
        } else {
          await page.screenshot({ path: out, type: 'jpeg', quality: 85 });
        }
        const dims = jpegSize(out);
        const bytes = readFileSync(out).length;
        check(`${shot.name}: ${dims.w}x${dims.h}, ${bytes} bytes`, dims.w === shot.w && dims.h === shot.h && bytes <= MAX_SHOT_BYTES, `${bytes} bytes`);
      }

      check('0 console errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300));
      check('0 failed requests', failedRequests.length === 0, failedRequests.join(' | ').slice(0, 300));
      check('0 external requests', externalRequests.length === 0, externalRequests.join(' | ').slice(0, 300));
      await context.close();
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }

  if (failures.length > 0) {
    console.log(`\nLIVE TEST FAILED: ${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log('\nLIVE TEST ALL PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
