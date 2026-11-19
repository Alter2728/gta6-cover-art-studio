// Live test + screenshots for Sunset Cover Studio (Playwright headless shell).
// Serves app/ with the repo's serve.ts, drives the editor (upload, drag,
// zoom, layout switch, caption edit, all three exports with PNG dimension
// checks), then renders each shot from shots.json into screenshots/.
// Run: node tools/take-shots.mjs
import { chromium } from '/home/hatch/workspace/makefun/token-radar-01-shots-tmp/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const PORT = 8902;
const SHELL = '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';

const shots = JSON.parse(readFileSync(join(repo, 'shots.json'), 'utf8'));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Read width/height out of a PNG's IHDR chunk. */
function pngSize(buf) {
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

async function main() {
  const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: repo, stdio: 'ignore' });
  await sleep(1200);
  const browser = await chromium.launch({ executablePath: SHELL, args: ['--no-sandbox'] });
  const failures = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const consoleErrors = [];
    const badRequests = [];
    const externalRequests = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));
    page.on('request', (req) => {
      const url = req.url();
      if (!url.startsWith(`http://localhost:${PORT}`) && !url.startsWith('data:')) {
        externalRequests.push(url);
      }
    });
    page.on('requestfailed', (req) => badRequests.push(req.url()));
    page.on('response', (res) => {
      if (res.status() >= 400) badRequests.push(`${res.status()} ${res.url()}`);
    });

    // ---- live test ---------------------------------------------------------
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__studio && window.__studio.state.photos.length >= 1, null, { timeout: 15000 });
    await sleep(600);
    const loaded = await page.evaluate(() => ({
      photos: window.__studio.state.photos.length,
      panels: window.__studio.state.panels.length,
      layout: window.__studio.state.layout,
    }));
    console.log(`PASS app loads, sample photo in, ${loaded.photos} photo(s), ${loaded.panels} panels (${loaded.layout})`);
    if (loaded.photos < 1) failures.push('sample-load');

    // Upload the second sample through the file input.
    await page.setInputFiles('#upload', join(repo, 'app/samples/boulevard.jpg'));
    await page.waitForFunction(() => window.__studio.state.photos.length >= 2, null, { timeout: 10000 });
    console.log('PASS upload adds a second photo');
    await sleep(300);

    // Switch to the 2x2 grid layout.
    await page.locator('#layouts button', { hasText: 'Grid' }).click();
    await sleep(300);
    const grid = await page.evaluate(() => window.__studio.state.panels.length);
    console.log(`${grid === 4 ? 'PASS' : 'FAIL'} grid layout gives 4 panels (got ${grid})`);
    if (grid !== 4) failures.push('layout-switch');

    // Drag the top-left panel to pan it.
    const box = await page.locator('#preview').boundingBox();
    const cx = box.x + box.width * 0.25;
    const cy = box.y + box.height * 0.25;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 50, cy + 25, { steps: 8 });
    await page.mouse.up();
    await sleep(200);
    const pan = await page.evaluate(() => window.__studio.state.panels[0].ox);
    console.log(`${pan !== 0 ? 'PASS' : 'FAIL'} drag pans panel 1 (ox=${pan.toFixed(3)})`);
    if (pan === 0) failures.push('drag-pan');

    // Wheel-zoom the selected panel.
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -400);
    await sleep(200);
    const zoom = await page.evaluate(() => window.__studio.state.panels[0].zoom);
    console.log(`${zoom > 1 ? 'PASS' : 'FAIL'} wheel zooms panel 1 (zoom=${zoom.toFixed(2)})`);
    if (zoom <= 1) failures.push('wheel-zoom');

    // Keyboard nudge.
    await page.locator('#preview').click();
    await page.keyboard.press('ArrowRight');
    await sleep(150);
    const nudged = await page.evaluate(() => window.__studio.state.panels[0].ox);
    console.log(`${nudged > pan ? 'PASS' : 'FAIL'} arrow key nudges panel (ox ${pan.toFixed(3)} -> ${nudged.toFixed(3)})`);
    if (nudged <= pan) failures.push('key-nudge');

    // Edit the caption and switch the grade.
    await page.fill('#title', 'NEON RIDE');
    await page.locator('#grades button', { hasText: 'Neon Nights' }).click();
    await sleep(300);
    const caption = await page.evaluate(() => window.__studio.state.title);
    console.log(`${caption === 'NEON RIDE' ? 'PASS' : 'FAIL'} caption edit applies (got "${caption}")`);
    if (caption !== 'NEON RIDE') failures.push('caption');

    // Export at all three sizes and verify the PNG dimensions.
    for (const size of [
      { label: '1080 × 1080', w: 1080, h: 1080 },
      { label: '1080 × 1350', w: 1080, h: 1350 },
      { label: '1920 × 1080', w: 1920, h: 1080 },
    ]) {
      await page.locator('#sizes button', { hasText: size.label }).click();
      await sleep(200);
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        page.click('#exportBtn'),
      ]);
      const path = await download.path();
      const buf = readFileSync(path);
      const dims = pngSize(buf);
      const ok = dims && dims.w === size.w && dims.h === size.h;
      console.log(`${ok ? 'PASS' : 'FAIL'} export ${size.label} -> PNG ${dims ? `${dims.w}x${dims.h}` : 'invalid'} (${buf.length} bytes)`);
      if (!ok) failures.push(`export-${size.w}x${size.h}`);
    }

    console.log(`${consoleErrors.length === 0 ? 'PASS' : 'FAIL'} console errors: ${consoleErrors.length}`);
    if (consoleErrors.length) { console.log(consoleErrors.slice(0, 5)); failures.push('console'); }
    console.log(`${externalRequests.length === 0 ? 'PASS' : 'FAIL'} external requests: ${externalRequests.length}`);
    if (externalRequests.length) { console.log(externalRequests); failures.push('network'); }
    console.log(`${badRequests.length === 0 ? 'PASS' : 'FAIL'} failed requests: ${badRequests.length}`);
    if (badRequests.length) { console.log(badRequests); failures.push('requests'); }

    // ---- screenshots -------------------------------------------------------
    mkdirSync(join(repo, 'screenshots'), { recursive: true });

    // 1-cover.jpg: the real exported 1920x1080 PNG, from a fresh load with
    // the default scene (pier, strip3, Vice Sunset, "Sunset Heist").
    {
      const fresh = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      fresh.on('pageerror', (err) => consoleErrors.push(String(err)));
      await fresh.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
      await fresh.waitForFunction(() => window.__studio && window.__studio.state.photos.length >= 1, null, { timeout: 15000 });
      await sleep(500);
      const [download] = await Promise.all([
        fresh.waitForEvent('download', { timeout: 15000 }),
        fresh.click('#exportBtn'),
      ]);
      const buf = readFileSync(await download.path());
      const dims = pngSize(buf);
      if (!dims || dims.w !== 1920 || dims.h !== 1080) {
        console.log(`FAIL 1-cover export is not 1920x1080 (${dims ? `${dims.w}x${dims.h}` : 'invalid'})`);
        failures.push('cover-export');
      }
      const viewer = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await viewer.setContent(
        `<html><body style="margin:0;background:#000"><img src="data:image/png;base64,${buf.toString('base64')}" style="width:1280px;height:720px;object-fit:contain;display:block"></body></html>`,
      );
      await sleep(300);
      await viewer.screenshot({ path: join(repo, 'screenshots', '1-cover.jpg'), type: 'jpeg', quality: 80 });
      await viewer.close();
      await fresh.close();
      console.log(`SHOT 1-cover.jpg ${statSync(join(repo, 'screenshots', '1-cover.jpg')).size} bytes (real exported PNG, 1920x1080 -> 1280x720)`);
    }

    // The other shots: editor + two exported covers drawn by the app itself.
    for (const shot of shots.slice(1)) {
      const shotPage = await browser.newPage({ viewport: { width: shot.w, height: shot.h } });
      shotPage.on('pageerror', (err) => consoleErrors.push(String(err)));
      await shotPage.goto(`http://localhost:${PORT}/${shot.query}`, { waitUntil: 'load' });
      await shotPage.waitForFunction(() => window.__shotReady === true, null, { timeout: 15000 });
      await sleep(400);
      const out = join(repo, 'screenshots', shot.name);
      await shotPage.screenshot({ path: out, type: 'jpeg', quality: 80 });
      await shotPage.close();
      console.log(`SHOT ${shot.name} ${statSync(out).size} bytes`);
    }

    for (const shot of shots) {
      const size = statSync(join(repo, 'screenshots', shot.name)).size;
      if (size > 262144) {
        console.log(`FAIL ${shot.name} over 256 KiB (${size} bytes)`);
        failures.push(`shot-size-${shot.name}`);
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(failures.length === 0 ? 'PLAYTEST ALL PASSED' : `PLAYTEST FAILURES: ${failures.join(', ')}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
