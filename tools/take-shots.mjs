// Live test + screenshots for Sunset Cover Studio.
//
// Serves app/ with serve.ts, drives it in headless Chromium (playwright-core
// from tools/.pw, using the cached Chromium build), and checks the whole
// flow a person would do: load a sample, upload a second photo, switch to the
// 4-frame layout, drag-pan, wheel-zoom, arrow-nudge, pick a preset headline,
// edit the headline, and export all three sizes — with zero console errors,
// zero failed requests and zero network requests to any other origin.
// Then it takes the four screenshots from shots.json: cover shots are the
// app's real exported PNG, scaled to the shot size; the editor shot is the
// live page. Usage: node tools/take-shots.mjs

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('./.pw/node_modules/playwright-core/index.js');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8123;
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function findChromium() {
  // Prefer the newest cached Chromium build; fall back to Playwright's own.
  const { readdirSync, existsSync } = require('node:fs');
  const cache = join(process.env.HOME, '.cache', 'ms-playwright');
  try {
    const dirs = readdirSync(cache)
      .filter((d) => d.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const d of dirs) {
      const full = join(cache, d, 'chrome-linux64', 'chrome');
      if (existsSync(full)) return full;
      const shell = join(cache, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
      if (existsSync(shell)) return shell;
    }
  } catch { /* fall through */ }
  return undefined;
}

async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function main() {
  const server = spawn(process.execPath, ['serve.ts', '--port', String(PORT)], {
    cwd: root,
    stdio: 'ignore',
  });
  try {
    if (!await waitForServer(`${BASE}/index.html`)) {
      console.log('FAIL  server did not come up');
      process.exitCode = 1;
      return;
    }

    const browser = await chromium.launch({
      executablePath: findChromium(),
      args: ['--no-sandbox'],
    });
    try {
      await liveTest(browser);
      await takeShots(browser);
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(failed.length === 0
    ? `\nALL PASSED (${results.length} checks)`
    : `\n${failed.length} FAILED of ${results.length} checks`);
  if (failed.length > 0) process.exitCode = 1;
}

async function liveTest(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrors = [];
  const failedRequests = [];
  const externalRequests = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('requestfailed', (r) => failedRequests.push(r.url()));
  page.on('request', (r) => {
    if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) {
      externalRequests.push(r.url());
    }
  });

  await page.goto(`${BASE}/index.html?scene=editor&layout=strip3&grade=vice&headline=VICE%20CITY&tagline=Welcome%20back`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 15000 });

  check('page loads and the scene is ready', true);
  check('sample photo is loaded into slot 1', await page.evaluate(() => !!window.__state.photos[0]));
  check('Anton font is loaded', await page.evaluate(() => document.fonts.check('40px Anton')));

  // Upload a second photo into slot 2.
  await page.setInputFiles('#photo2', join(root, 'app', 'samples', 'pier.jpg'));
  await page.waitForFunction(() => !!window.__state.photos[1], null, { timeout: 5000 });
  check('second photo uploads into slot 2', true);

  // Switch to the 4-frame layout and check the crops follow.
  await page.click('[data-group="layout"][data-value="grid4"]');
  check('grid4 layout has 4 frames', await page.evaluate(() => window.__state.crops.length === 4));

  // Drag-pan the selected frame.
  const before = await page.evaluate(() => ({ ...window.__state.crops[0] }));
  const canvas = page.locator('#cover');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.3, { steps: 8 });
  await page.mouse.up();
  const afterDrag = await page.evaluate(() => ({ ...window.__state.crops[0] }));
  check('drag-pan moves the selected frame', afterDrag.panX !== before.panX || afterDrag.panY !== before.panY,
    `pan ${before.panX.toFixed(3)},${before.panY.toFixed(3)} -> ${afterDrag.panX.toFixed(3)},${afterDrag.panY.toFixed(3)}`);

  // Wheel-zoom the selected frame.
  const zoomBefore = await page.evaluate(() => window.__state.crops[0].zoom);
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.mouse.wheel(0, -240);
  const zoomAfter = await page.evaluate(() => window.__state.crops[0].zoom);
  check('wheel-zoom zooms the selected frame', zoomAfter > zoomBefore, `${zoomBefore.toFixed(2)} -> ${zoomAfter.toFixed(2)}`);

  // Arrow-key nudge.
  const nudgeBefore = await page.evaluate(() => ({ ...window.__state.crops[0] }));
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  const nudgeAfter = await page.evaluate(() => ({ ...window.__state.crops[0] }));
  check('arrow keys nudge the selected frame', nudgeAfter.panX > nudgeBefore.panX && nudgeAfter.panY > nudgeBefore.panY,
    `pan ${nudgeBefore.panX.toFixed(3)},${nudgeBefore.panY.toFixed(3)} -> ${nudgeAfter.panX.toFixed(3)},${nudgeAfter.panY.toFixed(3)}`);

  // Preset headline, then edit it by typing.
  await page.click('[data-preset="NEON RIDE"]');
  check('preset headline applies', await page.evaluate(() => window.__state.headline === 'NEON RIDE'));
  await page.fill('#headline', 'PIER PRESSURE');
  check('edited headline applies', await page.evaluate(() => window.__state.headline === 'PIER PRESSURE'));

  // Grade slider: intensity 0 must wash the grade out (preview stays sane).
  await page.evaluate(() => {
    const s = document.getElementById('gradeIntensity');
    s.value = '0';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  check('grade intensity slider reaches 0', await page.evaluate(() => window.__state.gradeIntensity === 0));
  await page.evaluate(() => {
    const s = document.getElementById('gradeIntensity');
    s.value = '80';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Shuffle changes the composition.
  const layoutBefore = await page.evaluate(() => window.__state.layout);
  await page.click('#shuffle');
  const layoutAfter = await page.evaluate(() => window.__state.layout);
  check('shuffle runs without error', true, `layout ${layoutBefore} -> ${layoutAfter}`);

  // Export all three sizes through the app's own export path.
  for (const [w, h] of [[1080, 1080], [1080, 1350], [1920, 1080]]) {
    const dataUrl = await page.evaluate(([ew, eh]) => window.__exportCoverPNG(ew, eh), [w, h]);
    const ok = typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,');
    check(`export PNG ${w}x${h}`, ok, ok ? `${Math.round(dataUrl.length / 1024)} KiB data URL` : 'no PNG data');
    if (ok) {
      // The PNG really is w x h: decode its IHDR.
      const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
      const pw = buf.readUInt32BE(16);
      const ph = buf.readUInt32BE(20);
      check(`exported PNG is really ${w}x${h}`, pw === w && ph === h, `${pw}x${ph}`);
    }
  }

  // The canvas actually painted something (not a blank frame).
  const pixels = await page.evaluate(() => {
    const c = document.getElementById('cover');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let distinct = new Set();
    for (let i = 0; i < d.length; i += 400) distinct.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    return distinct.size;
  });
  check('preview canvas painted varied pixels', pixels > 50, `${pixels} distinct sampled colours`);

  check('zero console errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300));
  check('zero failed requests', failedRequests.length === 0, failedRequests.join(' | ').slice(0, 300));
  check('zero external requests', externalRequests.length === 0, externalRequests.join(' | ').slice(0, 300));
  await page.close();
}

async function takeShots(browser) {
  const shots = JSON.parse(await fs.readFile(join(root, 'shots.json'), 'utf8'));
  const dir = join(root, 'screenshots');
  await fs.mkdir(dir, { recursive: true });

  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: shot.w, height: shot.h } });
    await page.goto(`${BASE}/index.html${shot.query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 15000 });
    const outPath = join(dir, shot.name);
    if (shot.export) {
      // The real exported PNG, scaled to the shot size.
      const dataUrl = await page.evaluate(([w, h]) => window.__exportCoverPNG(w, h), [shot.export.w, shot.export.h]);
      const show = await browser.newPage({ viewport: { width: shot.w, height: shot.h } });
      await show.setContent(
        `<body style="margin:0"><img src="${dataUrl}" style="width:${shot.w}px;height:${shot.h}px;object-fit:cover;display:block"></body>`,
      );
      await show.screenshot({ path: outPath, type: 'jpeg', quality: 85 });
      await show.close();
    } else {
      await page.screenshot({ path: outPath, type: 'jpeg', quality: 85 });
    }
    await page.close();
    const stat = await fs.stat(outPath);
    const dims = await probeJpeg(outPath);
    check(`screenshot ${shot.name} is ${shot.w}x${shot.h} and <= 256 KiB`,
      stat.size <= 262144 && dims.w === shot.w && dims.h === shot.h,
      `${dims.w}x${dims.h}, ${Math.round(stat.size / 1024)} KiB`);
  }
}

/** Reads width/height out of a JPEG's SOF0 marker. */
async function probeJpeg(path) {
  const buf = await fs.readFile(path);
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return { w: 0, h: 0 };
}

main().catch((e) => {
  console.error('take-shots crashed:', e);
  process.exit(1);
});
