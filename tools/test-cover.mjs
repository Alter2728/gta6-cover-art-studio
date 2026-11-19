// Unit tests for Sunset Cover Studio (Node 22 standard library only).
// Run: node tools/test-cover.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRADES, INKS, EXPORT_SIZES, gradeById, inkById, exportSizeById,
  clampNumber, gradeAlpha,
} from '../app/src/grades.mjs';
import {
  LAYOUTS, layoutById, clamp, frameGap, frameRects, frameAt, freshCrop,
  defaultCrops, placePhoto, clampCrop, nudgeCrop, zoomCrop, shufflePick,
} from '../app/src/layouts.mjs';
import { mulberry32, hexToRgba, fitHeadlineSize, drawCover } from '../app/src/cover.mjs';
import { sceneParams } from '../app/src/shots.mjs';

const SIZES = [
  [1080, 1080],
  [1080, 1350],
  [1920, 1080],
];

/** A fake 2D context that records every drawing call for the renderer tests. */
class FakeCtx {
  constructor() {
    this.calls = [];
    this.fillStyle = '';
    this.strokeStyle = '';
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.font = '10px sans-serif';
    this.textAlign = 'left';
    this.shadowColor = '';
    this.shadowBlur = 0;
  }

  save() { this.calls.push(['save']); }
  restore() { this.calls.push(['restore']); }
  beginPath() { this.calls.push(['beginPath']); }
  rect(x, y, w, h) { this.calls.push(['rect', x, y, w, h]); }
  clip() { this.calls.push(['clip']); }
  fillRect(x, y, w, h) { this.calls.push(['fillRect', x, y, w, h, typeof this.fillStyle === 'string' ? this.fillStyle : 'gradient', this.globalAlpha, this.globalCompositeOperation]); }
  drawImage(img, dx, dy, dw, dh) { this.calls.push(['drawImage', img, dx, dy, dw, dh]); }
  fillText(text, x, y) { this.calls.push(['fillText', text, x, y, this.fillStyle, this.font]); }
  stroke() { this.calls.push(['stroke', typeof this.strokeStyle === 'string' ? this.strokeStyle : 'gradient', this.shadowBlur]); }
  moveTo(x, y) { this.calls.push(['moveTo', x, y]); }
  lineTo(x, y) { this.calls.push(['lineTo', x, y]); }
  createLinearGradient() { return { addColorStop: () => {} }; }
  createRadialGradient() { return { addColorStop: () => {} }; }
  measureText(text) {
    const size = parseFloat(this.font) || 10;
    return { width: text.length * size * 0.55 };
  }
}

function baseOpts(over = {}) {
  return {
    width: 1080,
    height: 1080,
    layoutId: 'strip3',
    photos: [{ image: {}, width: 720, height: 720 }],
    crops: defaultCrops('strip3', 1),
    gradeId: 'vice',
    intensity: 55,
    inkId: 'white',
    headline: 'VICE CITY',
    tagline: 'Welcome back',
    glow: 60,
    grain: true,
    vignette: true,
    seed: 7,
    ...over,
  };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// ---- frame gap ----------------------------------------------------------

test('frameGap is 9 px on a 1080 canvas', () => assert.equal(frameGap(1080, 1080), 9));
test('frameGap is 9 px on a 1920x1080 canvas', () => assert.equal(frameGap(1920, 1080), 9));
test('frameGap never drops below 2 px', () => assert.equal(frameGap(100, 100), 2));
test('frameGap rounds 0.8% of the short side', () => assert.equal(frameGap(1000, 500), 4));

// ---- layout geometry: 4 layouts x 3 sizes -------------------------------

for (const layoutId of Object.keys(LAYOUTS)) {
  for (const [w, h] of SIZES) {
    test(`frameRects ${layoutId} ${w}x${h} tiles the canvas without overlap`, () => {
      const frames = frameRects(layoutId, w, h);
      assert.equal(frames.length, LAYOUTS[layoutId].panels);
      for (const f of frames) {
        assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= w && f.y + f.h <= h, 'frame inside canvas');
        assert.ok(f.w > 0 && f.h > 0, 'frame has positive size');
      }
      for (let i = 0; i < frames.length; i++) {
        for (let j = i + 1; j < frames.length; j++) {
          assert.ok(!rectsOverlap(frames[i], frames[j]), `frames ${i} and ${j} overlap`);
        }
      }
      // Frames plus gaps cover the whole canvas in each direction.
      const g = frameGap(w, h);
      if (layoutId === 'strip3') {
        assert.equal(frames.reduce((n, f) => n + f.h, 0) + 2 * g, h);
        assert.ok(frames.every((f) => f.w === w));
      }
      if (layoutId === 'full1') assert.deepEqual(frames, [{ x: 0, y: 0, w, h }]);
      if (layoutId === 'split2') {
        assert.equal(frames.reduce((n, f) => n + f.w, 0) + g, w);
        assert.ok(frames.every((f) => f.h === h));
      }
      if (layoutId === 'grid4') {
        assert.equal(frames[0].w + g + frames[1].w, w);
        assert.equal(frames[0].h + g + frames[2].h, h);
      }
    });
  }
}

// ---- hit testing ---------------------------------------------------------

test('frameAt finds the top strip', () => assert.equal(frameAt('strip3', 1080, 1080, 540, 100), 0));
test('frameAt finds the middle strip', () => assert.equal(frameAt('strip3', 1080, 1080, 540, 540), 1));
test('frameAt finds the bottom strip', () => assert.equal(frameAt('strip3', 1080, 1080, 540, 1000), 2));
test('frameAt returns -1 inside a gap', () => assert.equal(frameAt('strip3', 1080, 1080, 540, 358), -1));
test('frameAt finds the only Full Bleed frame', () => assert.equal(frameAt('full1', 1080, 1080, 10, 10), 0));
test('frameAt splits left and right halves', () => {
  assert.equal(frameAt('split2', 1080, 1080, 100, 540), 0);
  assert.equal(frameAt('split2', 1080, 1080, 900, 540), 1);
});
test('frameAt finds all four grid corners', () => {
  assert.equal(frameAt('grid4', 1080, 1080, 100, 100), 0);
  assert.equal(frameAt('grid4', 1080, 1080, 900, 100), 1);
  assert.equal(frameAt('grid4', 1080, 1080, 100, 900), 2);
  assert.equal(frameAt('grid4', 1080, 1080, 900, 900), 3);
});
test('frameAt returns -1 outside the canvas', () => assert.equal(frameAt('grid4', 1080, 1080, -5, 100), -1));

// ---- crops ----------------------------------------------------------------

test('freshCrop starts unzoomed and unpanned on photo 0', () => {
  assert.deepEqual(freshCrop(), { photoIndex: 0, zoom: 1, ox: 0, oy: 0 });
});
test('defaultCrops with one photo uses photo 0 everywhere', () => {
  assert.ok(defaultCrops('grid4', 1).every((c) => c.photoIndex === 0));
  assert.equal(defaultCrops('grid4', 1).length, 4);
});
test('defaultCrops alternates two photos across panels', () => {
  assert.deepEqual(defaultCrops('grid4', 2).map((c) => c.photoIndex), [0, 1, 0, 1]);
});
test('defaultCrops cycles three photos across panels', () => {
  assert.deepEqual(defaultCrops('strip3', 3).map((c) => c.photoIndex), [0, 1, 2]);
});
test('defaultCrops has one crop for Full Bleed', () => {
  assert.equal(defaultCrops('full1', 2).length, 1);
});
test('defaultCrops with no photos still yields crops', () => {
  assert.equal(defaultCrops('split2', 0).length, 2);
});
test('placePhoto cover-fits a square photo into a wide frame', () => {
  const p = placePhoto(720, 720, { x: 0, y: 0, w: 1080, h: 354 }, freshCrop());
  assert.ok(p.dw >= 1080 && p.dh >= 354);
  assert.equal(p.dx, 0);
});
test('placePhoto centres the photo by default', () => {
  const p = placePhoto(720, 720, { x: 0, y: 0, w: 1080, h: 1080 }, freshCrop());
  assert.equal(p.dx, 0);
  assert.equal(p.dy, 0);
});
test('placePhoto zoom 2 doubles the drawn size', () => {
  const frame = { x: 0, y: 0, w: 1080, h: 1080 };
  const p = placePhoto(720, 720, frame, { photoIndex: 0, zoom: 2, ox: 0, oy: 0 });
  assert.equal(p.dw, 2160);
  assert.equal(p.dh, 2160);
});
test('placePhoto pan shifts the drawn position', () => {
  const frame = { x: 0, y: 0, w: 1080, h: 1080 };
  const p = placePhoto(720, 720, frame, { photoIndex: 0, zoom: 2, ox: 0.1, oy: -0.05 });
  assert.equal(p.dx, -540 + 108);
  assert.equal(p.dy, -540 - 54);
});
test('placePhoto of a portrait photo still covers the frame', () => {
  const p = placePhoto(720, 1280, { x: 0, y: 0, w: 1080, h: 1080 }, freshCrop());
  assert.ok(p.dw >= 1080 && p.dh >= 1080);
});
test('clampCrop clamps zoom below 1 up to 1', () => {
  const c = clampCrop({ photoIndex: 0, zoom: 0.2, ox: 0, oy: 0 }, 720, 720, { x: 0, y: 0, w: 1080, h: 1080 });
  assert.equal(c.zoom, 1);
});
test('clampCrop clamps zoom above 4 down to 4', () => {
  const c = clampCrop({ photoIndex: 0, zoom: 9, ox: 0, oy: 0 }, 720, 720, { x: 0, y: 0, w: 1080, h: 1080 });
  assert.equal(c.zoom, 4);
});
test('clampCrop forbids any pan at zoom 1 (no overhang)', () => {
  const c = clampCrop({ photoIndex: 0, zoom: 1, ox: 0.5, oy: 0.5 }, 720, 720, { x: 0, y: 0, w: 1080, h: 1080 });
  assert.equal(c.ox, 0);
  assert.equal(c.oy, 0);
});
test('clampCrop allows pan up to the overhang at zoom 2', () => {
  const c = clampCrop({ photoIndex: 0, zoom: 2, ox: 0.5, oy: 0.5 }, 720, 720, { x: 0, y: 0, w: 1080, h: 1080 });
  assert.equal(c.ox, 0.5);
  assert.equal(c.oy, 0.5);
});
test('clampCrop keeps the photo covering the frame after clamping', () => {
  const frame = { x: 0, y: 0, w: 1080, h: 1080 };
  const c = clampCrop({ photoIndex: 0, zoom: 2, ox: 9, oy: -9 }, 720, 720, frame);
  const p = placePhoto(720, 720, frame, c);
  assert.ok(p.dx <= 0 && p.dx + p.dw >= 1080);
  assert.ok(p.dy <= 0 && p.dy + p.dh >= 1080);
});
test('nudgeCrop moves the pan by the given step', () => {
  const frame = { x: 0, y: 0, w: 1080, h: 1080 };
  const c = nudgeCrop({ photoIndex: 0, zoom: 2, ox: 0, oy: 0 }, 720, 720, frame, 0.02, 0);
  assert.equal(c.ox, 0.02);
});
test('nudgeCrop cannot push the photo off the frame', () => {
  const frame = { x: 0, y: 0, w: 1080, h: 1080 };
  const c = nudgeCrop({ photoIndex: 0, zoom: 2, ox: 0.5, oy: 0 }, 720, 720, frame, 0.5, 0);
  assert.equal(c.ox, 0.5);
});
test('zoomCrop multiplies the zoom and clamps at 4', () => {
  const frame = { x: 0, y: 0, w: 1080, h: 1080 };
  assert.equal(zoomCrop({ photoIndex: 0, zoom: 2, ox: 0, oy: 0 }, 720, 720, frame, 1.5).zoom, 3);
  assert.equal(zoomCrop({ photoIndex: 0, zoom: 3, ox: 0, oy: 0 }, 720, 720, frame, 2).zoom, 4);
});
test('clamp helper clamps both ends', () => {
  assert.equal(clamp(5, 1, 4), 4);
  assert.equal(clamp(-1, 1, 4), 1);
  assert.equal(clamp(2, 1, 4), 2);
});

// ---- headline auto-fit ------------------------------------------------------

test('fitHeadlineSize keeps the start size for a short headline', () => {
  const ctx = new FakeCtx();
  assert.equal(fitHeadlineSize(ctx, 'VICE', 1000, 100), 100);
});
test('fitHeadlineSize shrinks a long headline to fit', () => {
  const ctx = new FakeCtx();
  const size = fitHeadlineSize(ctx, 'A VERY LONG HEADLINE THAT KEEPS GOING', 500, 100);
  assert.ok(size < 100);
  assert.ok(ctx.measureText('A VERY LONG HEADLINE THAT KEEPS GOING').width <= 500);
});
test('fitHeadlineSize never goes below 10 px', () => {
  const ctx = new FakeCtx();
  const size = fitHeadlineSize(ctx, 'X'.repeat(500), 50, 100);
  assert.equal(size, 10);
});
test('fitHeadlineSize sets an Anton font', () => {
  const ctx = new FakeCtx();
  fitHeadlineSize(ctx, 'VICE CITY', 1000, 100);
  assert.ok(ctx.font.includes('Anton'));
});
test('fitHeadlineSize fits exactly at the boundary', () => {
  const ctx = new FakeCtx();
  // 9 chars * 100px * 0.55 = 495 <= 500, so size 100 survives.
  assert.equal(fitHeadlineSize(ctx, '123456789', 500, 100), 100);
});

// ---- grades, inks, export sizes ---------------------------------------------

test('Vice Sunset grade has the exact stops, mode, strength and sky', () => {
  assert.deepEqual(GRADES.vice.stops, [[0.0, '#ff2e88'], [0.5, '#ff6a3d'], [1.0, '#ffc53d']]);
  assert.equal(GRADES.vice.mode, 'overlay');
  assert.equal(GRADES.vice.strength, 0.55);
  assert.equal(GRADES.vice.sky, '#2b0a3d');
});
test('Pastel Dawn grade has the exact values', () => {
  assert.deepEqual(GRADES.pastel.stops, [[0.0, '#ffb3d9'], [0.5, '#ffd9a0'], [1.0, '#b8c6ff']]);
  assert.equal(GRADES.pastel.mode, 'soft-light');
  assert.equal(GRADES.pastel.strength, 0.5);
  assert.equal(GRADES.pastel.sky, '#3d2b52');
});
test('Neon Nights grade has the exact values', () => {
  assert.deepEqual(GRADES.neon.stops, [[0.0, '#00e5ff'], [0.5, '#b537f2'], [1.0, '#ff2e88']]);
  assert.equal(GRADES.neon.mode, 'overlay');
  assert.equal(GRADES.neon.strength, 0.6);
  assert.equal(GRADES.neon.sky, '#0a0620');
});
test('Palm Gold grade has the exact values', () => {
  assert.deepEqual(GRADES.gold.stops, [[0.0, '#ffd76a'], [0.5, '#ff9e4d'], [1.0, '#2ec4b6']]);
  assert.equal(GRADES.gold.mode, 'soft-light');
  assert.equal(GRADES.gold.strength, 0.5);
  assert.equal(GRADES.gold.sky, '#1d2b1f');
});
test('there are exactly 4 grades', () => assert.equal(Object.keys(GRADES).length, 4));
test('gradeAlpha is 0 at intensity 0 (neutral, no tint)', () => {
  assert.equal(gradeAlpha(GRADES.vice, 0), 0);
});
test('gradeAlpha is the full strength at intensity 100', () => {
  assert.equal(gradeAlpha(GRADES.vice, 100), 0.55);
  assert.equal(gradeAlpha(GRADES.neon, 100), 0.6);
});
test('gradeAlpha scales linearly with intensity', () => {
  assert.equal(gradeAlpha(GRADES.vice, 50), 0.275);
});
test('gradeById falls back to Vice Sunset', () => assert.equal(gradeById('nope').id, 'vice'));
test('White ink is white with a dark shadow', () => {
  assert.equal(INKS.white.color, '#ffffff');
  assert.equal(INKS.white.shadow, 'rgba(20,0,30,0.6)');
});
test('Gold ink has the exact colour and shadow', () => {
  assert.equal(INKS.gold.color, '#ffd76a');
  assert.equal(INKS.gold.shadow, 'rgba(60,10,0,0.65)');
});
test('Neon Pink ink has the exact colour and shadow', () => {
  assert.equal(INKS.neon.color, '#ff5da2');
  assert.equal(INKS.neon.shadow, 'rgba(0,20,40,0.65)');
});
test('Midnight ink has the exact colour and shadow', () => {
  assert.equal(INKS.midnight.color, '#14101e');
  assert.equal(INKS.midnight.shadow, 'rgba(255,255,255,0.45)');
});
test('there are exactly 4 inks', () => assert.equal(Object.keys(INKS).length, 4));
test('inkById falls back to White', () => assert.equal(inkById('nope').id, 'white'));
test('there are exactly 3 export sizes', () => assert.equal(EXPORT_SIZES.length, 3));
test('export sizes are 1080x1080, 1080x1350 and 1920x1080', () => {
  assert.deepEqual(EXPORT_SIZES.map((s) => [s.w, s.h]), [[1080, 1080], [1080, 1350], [1920, 1080]]);
});
test('exportSizeById finds sizes by id and by WxH', () => {
  assert.equal(exportSizeById('portrait').h, 1350);
  assert.equal(exportSizeById('1920x1080').w, 1920);
  assert.equal(exportSizeById('nope').w, 1080);
});
test('clampNumber clamps both ends', () => {
  assert.equal(clampNumber(150, 0, 100), 100);
  assert.equal(clampNumber(-5, 0, 100), 0);
});
test('layoutById falls back to Sunset Strip', () => assert.equal(layoutById('nope').id, 'strip3'));
test('there are exactly 4 layouts', () => assert.equal(Object.keys(LAYOUTS).length, 4));

// ---- helpers ------------------------------------------------------------------

test('hexToRgba converts a hex colour with alpha', () => {
  assert.equal(hexToRgba('#ff2e88', 0.5), 'rgba(255,46,136,0.5)');
});
test('hexToRgba handles black and white', () => {
  assert.equal(hexToRgba('#000000', 0), 'rgba(0,0,0,0)');
  assert.equal(hexToRgba('#ffffff', 1), 'rgba(255,255,255,1)');
});
test('mulberry32 is deterministic for the same seed', () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});
test('mulberry32 differs across seeds', () => {
  assert.notEqual(mulberry32(7)(), mulberry32(8)());
});

// ---- renderer against a fake context -------------------------------------------

test('renderer fills the sky colour first', () => {
  const ctx = new FakeCtx();
  drawCover(ctx, baseOpts());
  const firstFill = ctx.calls.find((c) => c[0] === 'fillRect');
  assert.equal(firstFill[5], '#2b0a3d');
});
test('renderer draws one photo per panel', () => {
  const ctx = new FakeCtx();
  drawCover(ctx, baseOpts());
  assert.equal(ctx.calls.filter((c) => c[0] === 'drawImage').length, 3);
});
test('renderer fills a dark panel when a photo is missing', () => {
  const ctx = new FakeCtx();
  drawCover(ctx, baseOpts({ photos: [], crops: defaultCrops('strip3', 0) }));
  assert.equal(ctx.calls.filter((c) => c[0] === 'drawImage').length, 0);
  assert.ok(ctx.calls.some((c) => c[0] === 'fillRect' && c[5] === '#1a0f24'));
});
test('renderer draws no grade wash at intensity 0', () => {
  const ctx = new FakeCtx();
  drawCover(ctx, baseOpts({ intensity: 0 }));
  const washes = ctx.calls.filter((c) => c[0] === 'fillRect' && c[6] === 0);
  assert.equal(washes.length, 0);
  // Only sky, dark-panel and grain/vignette fills remain; none use overlay.
  assert.ok(!ctx.calls.some((c) => c[0] === 'fillRect' && c[7] === 'overlay'));
});
test('renderer draws the grade wash at full intensity', () => {
  const ctx = new FakeCtx();
  drawCover(ctx, baseOpts({ intensity: 100 }));
  assert.ok(ctx.calls.some((c) => c[0] === 'fillRect' && c[7] === 'overlay' && Math.abs(c[6] - 0.55) < 1e-9));
});
test('renderer draws the headline in the chosen ink', () => {
  const ctx = new FakeCtx();
  drawCover(ctx, baseOpts({ inkId: 'gold' }));
  assert.ok(ctx.calls.some((c) => c[0] === 'fillText' && c[1] === 'VICE CITY' && c[4] === '#ffd76a'));
});
test('renderer draws the tagline under the headline', () => {
  const ctx = new FakeCtx();
  drawCover(ctx, baseOpts());
  assert.ok(ctx.calls.some((c) => c[0] === 'fillText' && c[1] === 'WELCOME BACK'));
});
test('renderer draws two neon rules around the headline', () => {
  const ctx = new FakeCtx();
  drawCover(ctx, baseOpts());
  assert.equal(ctx.calls.filter((c) => c[0] === 'stroke').length, 2);
});
test('renderer grain is deterministic: two draws record identical calls', () => {
  const a = new FakeCtx();
  const b = new FakeCtx();
  drawCover(a, baseOpts());
  drawCover(b, baseOpts());
  assert.deepEqual(a.calls, b.calls);
});
test('renderer with grain off draws fewer speck fills', () => {
  const on = new FakeCtx();
  const off = new FakeCtx();
  drawCover(on, baseOpts({ grain: true }));
  drawCover(off, baseOpts({ grain: false }));
  assert.ok(on.calls.filter((c) => c[0] === 'fillRect').length > off.calls.filter((c) => c[0] === 'fillRect').length);
});
test('renderer draws the same cover at every export size', () => {
  for (const size of EXPORT_SIZES) {
    const ctx = new FakeCtx();
    drawCover(ctx, baseOpts({ width: size.w, height: size.h }));
    assert.ok(ctx.calls.some((c) => c[0] === 'fillText' && c[1] === 'VICE CITY'));
    assert.equal(ctx.calls.filter((c) => c[0] === 'drawImage').length, 3);
  }
});
test('renderer draws nothing for an empty headline', () => {
  const ctx = new FakeCtx();
  drawCover(ctx, baseOpts({ headline: '   ', tagline: '' }));
  assert.ok(!ctx.calls.some((c) => c[0] === 'fillText'));
  assert.equal(ctx.calls.filter((c) => c[0] === 'stroke').length, 0);
});

// ---- shuffle determinism ---------------------------------------------------------

test('shufflePick is deterministic with a seeded rng', () => {
  const a = shufflePick(mulberry32(42));
  const b = shufflePick(mulberry32(42));
  assert.deepEqual(a, b);
});
test('shufflePick differs with a different seed', () => {
  const a = shufflePick(mulberry32(1));
  const b = shufflePick(mulberry32(2));
  assert.ok(JSON.stringify(a) !== JSON.stringify(b));
});
test('shufflePick returns a valid layout, grade and ink', () => {
  const picked = shufflePick(mulberry32(9));
  assert.ok(LAYOUTS[picked.layout]);
  assert.ok(GRADES[picked.grade]);
  assert.ok(INKS[picked.ink]);
});
test('shufflePick returns one crop per panel of its layout', () => {
  const picked = shufflePick(mulberry32(9));
  assert.equal(picked.crops.length, LAYOUTS[picked.layout].panels);
});

// ---- scenes -----------------------------------------------------------------------

test('sceneParams defaults to the editor scene', () => {
  const p = sceneParams(new URLSearchParams(''));
  assert.equal(p.scene, 'editor');
  assert.equal(p.layout, 'strip3');
  assert.equal(p.grade, 'vice');
  assert.equal(p.headline, 'VICE CITY');
  assert.equal(p.photo, 'pier');
});
test('sceneParams parses a cover scene query', () => {
  const p = sceneParams(new URLSearchParams('?scene=cover&layout=grid4&grade=neon&headline=NEON%20RIDE&tagline=Drive%20all%20night'));
  assert.equal(p.scene, 'cover');
  assert.equal(p.layout, 'grid4');
  assert.equal(p.grade, 'neon');
  assert.equal(p.headline, 'NEON RIDE');
  assert.equal(p.tagline, 'Drive all night');
});
test('sceneParams decodes percent-encoded headlines', () => {
  const p = sceneParams(new URLSearchParams('?headline=SUNSET%20DRIVE&tagline=Golden%20hour%20in%20Vice%20City'));
  assert.equal(p.headline, 'SUNSET DRIVE');
  assert.equal(p.tagline, 'Golden hour in Vice City');
});
test('sceneParams parses the portrait cover shot', () => {
  const p = sceneParams(new URLSearchParams('?scene=cover&layout=strip3&grade=gold&headline=PIER%20PRESSURE'));
  assert.equal(p.grade, 'gold');
  assert.equal(p.headline, 'PIER PRESSURE');
});
test('sceneParams parses the square cover shot', () => {
  const p = sceneParams(new URLSearchParams('?scene=cover&layout=split2&grade=pastel&headline=SUNSET%20DRIVE'));
  assert.equal(p.layout, 'split2');
  assert.equal(p.grade, 'pastel');
});
test('sceneParams keeps an ink override', () => {
  const p = sceneParams(new URLSearchParams('?ink=neon'));
  assert.equal(p.ink, 'neon');
});
