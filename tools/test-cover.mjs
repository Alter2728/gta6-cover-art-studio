// Unit tests for Sunset Cover Studio's pure modules (layouts, grades, cover
// renderer, scenes). Runs in Node with a fake 2D context that records every
// call, so no browser is needed. Usage: node tools/test-cover.mjs

import { frameRects, frameAt, frameGap, layoutById, LAYOUTS, placePhoto, freshCrop, defaultCrops, nudgeCrop, zoomCrop, clamp } from '../app/src/layouts.mjs';
import { GRADES, gradeById, gradeWash, INKS, inkById, EXPORT_SIZES, exportSizeById, exportFileName } from '../app/src/grades.mjs';
import { mulberry32, fitHeadline, drawGrain, drawNeonRule, renderCover, shuffleState, coverStateDefaults, HEADLINE_PRESETS } from '../app/src/cover.mjs';
import { parseScene } from '../app/src/shots.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failed += 1;
    failures.push(`${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg} (got ${a}, want ${b})`);
}

function assertNear(a, b, eps, msg) {
  if (Math.abs(a - b) > eps) throw new Error(`${msg} (got ${a}, want ${b} ± ${eps})`);
}

// --- A fake 2D context that records every call and property set -------------
function makeFakeGradient(calls, kind) {
  return {
    kind,
    stops: [],
    addColorStop(at, color) {
      calls.push(['addColorStop', at, color]);
      this.stops.push([at, color]);
    },
  };
}

function makeFakeCtx() {
  const calls = [];
  const sets = [];
  const target = {
    measureText(text) {
      calls.push(['measureText', text]);
      const m = /(\d+(?:\.\d+)?)px/.exec(this.font || '');
      const size = m ? Number(m[1]) : 10;
      return { width: text.length * size * 0.62 };
    },
    createLinearGradient() {
      calls.push(['createLinearGradient']);
      return makeFakeGradient(calls, 'linear');
    },
    createRadialGradient() {
      calls.push(['createRadialGradient']);
      return makeFakeGradient(calls, 'radial');
    },
  };
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (prop === 'calls') return calls;
      if (prop === 'sets') return sets;
      if (prop in t) {
        const v = t[prop];
        return typeof v === 'function' ? v.bind(proxy) : v;
      }
      return (...args) => {
        calls.push([String(prop), ...args]);
      };
    },
    set(t, prop, value) {
      sets.push([String(prop), value]);
      t[prop] = value;
      return true;
    },
  });
  return proxy;
}

function fakePhoto(w, h) {
  return { naturalWidth: w, naturalHeight: h };
}

const SIZES = [
  [1080, 1080],
  [1080, 1350],
  [1920, 1080],
];

// --- Layout geometry: 4 layouts x 3 sizes ----------------------------------
for (const layout of LAYOUTS) {
  for (const [w, h] of SIZES) {
    check(`${layout.id} tiles ${w}x${h}`, () => {
      const rects = frameRects(layout.id, w, h);
      assertEq(rects.length, layout.frames, 'frame count');
      for (const r of rects) {
        assert(r.x >= 0 && r.y >= 0, 'frame inside canvas');
        assert(r.x + r.w <= w + 0.001 && r.y + r.h <= h + 0.001, 'frame inside canvas');
        assert(r.w > 50 && r.h > 50, 'frame is not degenerate');
      }
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          const a = rects[i];
          const b = rects[j];
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          assert(!overlap, `frames ${i} and ${j} overlap`);
        }
      }
      const area = rects.reduce((sum, r) => sum + r.w * r.h, 0);
      assert(area > w * h * 0.95, 'frames cover nearly the whole canvas');
    });
  }
}

// --- Layout lookups ----------------------------------------------------------
check('layoutById finds all four layouts', () => {
  for (const l of LAYOUTS) assertEq(layoutById(l.id).id, l.id, 'lookup');
});
check('layoutById falls back to strip3 for an unknown id', () => {
  assertEq(layoutById('nope').id, 'strip3', 'fallback');
});
check('frameGap scales with canvas size', () => {
  assert(frameGap(1920, 1080) > frameGap(540, 540), 'bigger canvas, bigger gap');
  assert(frameGap(100, 100) >= 2, 'gap has a floor');
});
check('frameAt hits each strip3 band', () => {
  assertEq(frameAt('strip3', 1080, 1080, 540, 100), 0, 'top band');
  assertEq(frameAt('strip3', 1080, 1080, 540, 540), 1, 'middle band');
  assertEq(frameAt('strip3', 1080, 1080, 540, 1000), 2, 'bottom band');
});
check('frameAt returns -1 outside the canvas', () => {
  assertEq(frameAt('strip3', 1080, 1080, -5, 100), -1, 'left of canvas');
  assertEq(frameAt('strip3', 1080, 1080, 2000, 100), -1, 'right of canvas');
});
check('frameAt hits split2 halves and grid4 corners', () => {
  assertEq(frameAt('split2', 1080, 1080, 100, 540), 0, 'left half');
  assertEq(frameAt('split2', 1080, 1080, 1000, 540), 1, 'right half');
  assertEq(frameAt('grid4', 1080, 1080, 100, 100), 0, 'top-left');
  assertEq(frameAt('grid4', 1080, 1080, 1000, 1000), 3, 'bottom-right');
  assertEq(frameAt('full', 1080, 1080, 540, 540), 0, 'full bleed');
});

// --- Photo placement ---------------------------------------------------------
check('placePhoto covers a square frame with a landscape photo', () => {
  const p = placePhoto(1600, 900, { x: 0, y: 0, w: 1080, h: 1080 }, freshCrop(0));
  assert(p.dw >= 1080 && p.dh >= 1080, 'photo fills the frame');
  assertNear(p.dw, 1920, 1, 'width from cover-fit');
});
check('placePhoto covers a landscape frame with a portrait photo', () => {
  const p = placePhoto(900, 1600, { x: 0, y: 0, w: 1920, h: 1080 }, freshCrop(0));
  assert(p.dw >= 1920 && p.dh >= 1080, 'photo fills the frame');
});
check('placePhoto centres the photo when zoom is 1', () => {
  const p = placePhoto(1600, 900, { x: 0, y: 0, w: 1080, h: 1080 }, freshCrop(0));
  assertNear(p.dx + p.dw / 2, 540, 1, 'centred horizontally');
  assertNear(p.dy + p.dh / 2, 540, 1, 'centred vertically');
});
check('placePhoto zoom 2 doubles the drawn size', () => {
  const base = placePhoto(1600, 900, { x: 0, y: 0, w: 1080, h: 1080 }, freshCrop(0));
  const zoomed = placePhoto(1600, 900, { x: 0, y: 0, w: 1080, h: 1080 }, { photo: 0, zoom: 2, panX: 0, panY: 0 });
  assertNear(zoomed.dw, base.dw * 2, 1, 'doubled width');
  assertNear(zoomed.dh, base.dh * 2, 1, 'doubled height');
});
check('placePhoto clamps zoom below 1 up to 1', () => {
  const p = placePhoto(1600, 900, { x: 0, y: 0, w: 1080, h: 1080 }, { photo: 0, zoom: 0.4, panX: 0, panY: 0 });
  const base = placePhoto(1600, 900, { x: 0, y: 0, w: 1080, h: 1080 }, freshCrop(0));
  assertNear(p.dw, base.dw, 1, 'zoom floor is 1');
});
check('placePhoto pan shifts the photo', () => {
  const frame = { x: 0, y: 0, w: 1080, h: 1080 };
  const centred = placePhoto(1600, 900, frame, { photo: 0, zoom: 2, panX: 0, panY: 0 });
  const panned = placePhoto(1600, 900, frame, { photo: 0, zoom: 2, panX: 0.1, panY: 0 });
  assert(panned.dx > centred.dx, 'pan right moves the photo right');
  assertNear(panned.dx - centred.dx, 108, 1, 'pan is a fraction of frame width');
});
check('placePhoto clamps pan so the photo still covers the frame', () => {
  const frame = { x: 0, y: 0, w: 1080, h: 1080 };
  const p = placePhoto(1600, 900, frame, { photo: 0, zoom: 1.2, panX: 0.5, panY: -0.5 });
  assert(p.dx <= 0 && p.dx + p.dw >= 1080, 'still covers horizontally');
  assert(p.dy <= 0 && p.dy + p.dh >= 1080, 'still covers vertically');
});
check('placePhoto with a square photo in a square frame is exact', () => {
  const p = placePhoto(1000, 1000, { x: 0, y: 0, w: 1080, h: 1080 }, freshCrop(0));
  assertNear(p.dx, 0, 0.001, 'exact left');
  assertNear(p.dy, 0, 0.001, 'exact top');
  assertNear(p.dw, 1080, 0.001, 'exact width');
});

// --- Crop helpers ------------------------------------------------------------
check('freshCrop starts centred at zoom 1', () => {
  const c = freshCrop(2);
  assertEq(c.photo, 2, 'photo slot');
  assertEq(c.zoom, 1, 'zoom');
  assertEq(c.panX, 0, 'panX');
  assertEq(c.panY, 0, 'panY');
});
check('defaultCrops alternates two photos across grid4', () => {
  const crops = defaultCrops('grid4', 2);
  assertEq(crops.map((c) => c.photo).join(','), '0,1,0,1', 'alternating');
});
check('defaultCrops uses photo 0 when only one photo is loaded', () => {
  const crops = defaultCrops('strip3', 1);
  assert(crops.every((c) => c.photo === 0), 'all photo 0');
});
check('defaultCrops has one crop per frame', () => {
  for (const l of LAYOUTS) assertEq(defaultCrops(l.id, 2).length, l.frames, l.id);
});
check('nudgeCrop moves left/right/up/down by the step', () => {
  const c = freshCrop(0);
  assertEq(nudgeCrop(c, 'right').panX, 0.02, 'right');
  assertEq(nudgeCrop(c, 'left').panX, -0.02, 'left');
  assertEq(nudgeCrop(c, 'down').panY, 0.02, 'down');
  assertEq(nudgeCrop(c, 'up').panY, -0.02, 'up');
});
check('nudgeCrop never leaves the [-0.5, 0.5] band', () => {
  let c = { photo: 0, zoom: 1, panX: 0.49, panY: 0 };
  c = nudgeCrop(c, 'right');
  assert(c.panX <= 0.5, 'clamped at 0.5');
});
check('zoomCrop multiplies and clamps to [1, 4]', () => {
  assertEq(zoomCrop(freshCrop(0), 2).zoom, 2, 'zoom in');
  assertEq(zoomCrop({ photo: 0, zoom: 3.9, panX: 0, panY: 0 }, 2).zoom, 4, 'zoom cap');
  assertEq(zoomCrop(freshCrop(0), 0.1).zoom, 1, 'zoom floor');
});
check('clamp holds values inside the band', () => {
  assertEq(clamp(-5, 0, 10), 0, 'below');
  assertEq(clamp(50, 0, 10), 10, 'above');
  assertEq(clamp(4, 0, 10), 4, 'inside');
});

// --- Grades ------------------------------------------------------------------
check('all four grades are defined with stops, mode, strength and sky', () => {
  assertEq(GRADES.length, 4, 'four grades');
  for (const g of GRADES) {
    assert(g.stops.length >= 2, `${g.id} has stops`);
    assert(g.stops[0][0] === 0 && g.stops[g.stops.length - 1][0] === 1, `${g.id} spans 0..1`);
    assert(['overlay', 'soft-light'].includes(g.mode), `${g.id} mode`);
    assert(g.strength > 0 && g.strength <= 1, `${g.id} strength`);
    assert(/^#[0-9a-f]{6}$/.test(g.sky), `${g.id} sky colour`);
  }
});
check('gradeWash at intensity 0 is fully neutral', () => {
  assertEq(gradeWash(GRADES[0], 0).alpha, 0, 'alpha 0');
});
check('gradeWash at intensity 100 is the full strength', () => {
  assertEq(gradeWash(GRADES[0], 100).alpha, GRADES[0].strength, 'full strength');
});
check('gradeWash at intensity 50 is half strength', () => {
  assertNear(gradeWash(GRADES[0], 50).alpha, GRADES[0].strength / 2, 1e-9, 'half');
});
check('gradeWash clamps intensity above 100', () => {
  assertEq(gradeWash(GRADES[0], 250).alpha, GRADES[0].strength, 'clamped');
});
check('gradeById resolves every grade and falls back', () => {
  for (const g of GRADES) assertEq(gradeById(g.id).id, g.id, g.id);
  assertEq(gradeById('nope').id, 'vice', 'fallback is vice');
});
check('all four inks are defined with a colour and a shadow', () => {
  assertEq(INKS.length, 4, 'four inks');
  for (const i of INKS) {
    assert(/^#[0-9a-f]{6}$/.test(i.color), `${i.id} colour`);
    assert(i.shadow.includes('rgba'), `${i.id} shadow`);
  }
});
check('inkById resolves every ink and falls back to white', () => {
  for (const i of INKS) assertEq(inkById(i.id).id, i.id, i.id);
  assertEq(inkById('nope').id, 'white', 'fallback is white');
});

// --- Export sizes ------------------------------------------------------------
check('the three export sizes are the bounty sizes', () => {
  assertEq(EXPORT_SIZES.length, 3, 'three sizes');
  const ids = EXPORT_SIZES.map((s) => s.id).sort().join(',');
  assertEq(ids, '1080x1080,1080x1350,1920x1080', 'sizes');
});
check('exportSizeById resolves every size and falls back to square', () => {
  assertEq(exportSizeById('1920x1080').width, 1920, 'landscape');
  assertEq(exportSizeById('1080x1350').height, 1350, 'portrait');
  assertEq(exportSizeById('nope').id, '1080x1080', 'fallback is square');
});
check('exportFileName names the PNG by its size', () => {
  assertEq(exportFileName({ width: 1920, height: 1080 }), 'sunset-cover-1920x1080.png', 'name');
});

// --- Headline presets and auto-fit -------------------------------------------
check('the four headline presets are the briefed ones', () => {
  assertEq(HEADLINE_PRESETS.join('|'), 'VICE CITY|SUNSET DRIVE|NEON RIDE|PIER PRESSURE', 'presets');
});
check('fitHeadline keeps a short headline at max size', () => {
  const ctx = makeFakeCtx();
  assertEq(fitHeadline(ctx, 'VICE CITY', 972, 124), 124, 'max size kept');
});
check('fitHeadline shrinks a long headline to fit', () => {
  const ctx = makeFakeCtx();
  const size = fitHeadline(ctx, 'A VERY LONG HEADLINE TEXT HERE', 972, 124);
  assert(size < 124, 'shrunk');
  const w = 'A VERY LONG HEADLINE TEXT HERE'.length * size * 0.62;
  assert(w <= 972, 'fits the width');
});
check('fitHeadline never goes below the minimum size', () => {
  const ctx = makeFakeCtx();
  const size = fitHeadline(ctx, 'X'.repeat(200), 972, 124, 12);
  assertEq(size, 12, 'floor is 12');
});
check('fitHeadline returns max size for an empty headline', () => {
  const ctx = makeFakeCtx();
  assertEq(fitHeadline(ctx, '', 972, 124), 124, 'empty keeps max');
});

// --- Seeded PRNG --------------------------------------------------------------
check('mulberry32 with the same seed gives the same sequence', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 20; i += 1) assertEq(a(), b(), `draw ${i}`);
});
check('mulberry32 with different seeds gives different sequences', () => {
  const a = mulberry32(1)();
  const b = mulberry32(2)();
  assert(a !== b, 'first draws differ');
});
check('mulberry32 stays in [0, 1)', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 500; i += 1) {
    const v = rng();
    assert(v >= 0 && v < 1 && Number.isFinite(v), `draw ${i} in range`);
  }
});

// --- Grain ---------------------------------------------------------------------
check('drawGrain is deterministic for the same seed', () => {
  const a = makeFakeCtx();
  const b = makeFakeCtx();
  drawGrain(a, 800, 600, 7);
  drawGrain(b, 800, 600, 7);
  assertEq(JSON.stringify(a.calls), JSON.stringify(b.calls), 'identical call log');
});
check('drawGrain differs for a different seed', () => {
  const a = makeFakeCtx();
  const b = makeFakeCtx();
  drawGrain(a, 800, 600, 7);
  drawGrain(b, 800, 600, 8);
  assert(JSON.stringify(a.calls) !== JSON.stringify(b.calls), 'different call log');
});
check('drawGrain draws more specks on a bigger canvas', () => {
  const small = makeFakeCtx();
  const big = makeFakeCtx();
  drawGrain(small, 400, 300, 7);
  drawGrain(big, 1920, 1080, 7);
  assert(big.calls.length > small.calls.length, 'more specks when bigger');
});

// --- Neon rule -------------------------------------------------------------------
check('drawNeonRule draws a halo line and a core line', () => {
  const ctx = makeFakeCtx();
  drawNeonRule(ctx, 1080, 500, 4, 70);
  const strokes = ctx.calls.filter((c) => c[0] === 'stroke');
  assertEq(strokes.length, 2, 'two strokes');
  const gradStops = ctx.calls.filter((c) => c[0] === 'addColorStop');
  assert(gradStops.length >= 3, 'magenta-gold-cyan gradient');
});
check('drawNeonRule at glow 0 draws no halo', () => {
  const ctx = makeFakeCtx();
  drawNeonRule(ctx, 1080, 500, 4, 0);
  const alphas = ctx.sets.filter((s) => s[0] === 'globalAlpha').map((s) => s[1]);
  assert(alphas.includes(0), 'halo alpha is 0 at glow 0');
});

// --- Renderer vs fake context ------------------------------------------------------
function renderState(overrides = {}) {
  const s = coverStateDefaults();
  s.photos = [fakePhoto(1600, 900), fakePhoto(900, 1600), null];
  s.crops = defaultCrops(s.layout, 2);
  return { ...s, ...overrides };
}

check('renderCover draws one photo per frame', () => {
  const ctx = makeFakeCtx();
  renderCover(ctx, renderState(), 1080, 1080);
  const draws = ctx.calls.filter((c) => c[0] === 'drawImage');
  assertEq(draws.length, 3, 'three frames, three photos');
});
check('renderCover draws a placeholder when a frame has no photo', () => {
  const ctx = makeFakeCtx();
  const s = renderState();
  s.photos = [null, null, null];
  renderCover(ctx, s, 1080, 1080);
  const draws = ctx.calls.filter((c) => c[0] === 'drawImage');
  assertEq(draws.length, 0, 'no photos drawn');
  assert(ctx.calls.some((c) => c[0] === 'fillRect'), 'placeholder fills the frame');
});
check('renderCover writes the headline and the tagline', () => {
  const ctx = makeFakeCtx();
  renderCover(ctx, renderState(), 1080, 1080);
  const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  assert(texts.includes('VICE CITY'), 'headline drawn');
  assert(texts.includes('Welcome back to Vice City'), 'tagline drawn');
});
check('renderCover skips the headline when it is empty', () => {
  const ctx = makeFakeCtx();
  renderCover(ctx, renderState({ headline: '   ' }), 1080, 1080);
  const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  assert(!texts.includes(''), 'no empty headline drawn');
  assert(texts.includes('Welcome back to Vice City'), 'tagline still drawn');
});
check('renderCover applies no grade wash at intensity 0', () => {
  const ctx = makeFakeCtx();
  renderCover(ctx, renderState({ gradeIntensity: 0 }), 1080, 1080);
  const modes = ctx.sets.filter((s) => s[0] === 'globalCompositeOperation').map((s) => s[1]);
  assert(!modes.includes('overlay') && !modes.includes('soft-light'), 'no wash composite');
});
check('renderCover applies the grade wash at full intensity', () => {
  const ctx = makeFakeCtx();
  renderCover(ctx, renderState({ gradeIntensity: 100 }), 1080, 1080);
  const modes = ctx.sets.filter((s) => s[0] === 'globalCompositeOperation').map((s) => s[1]);
  assert(modes.includes('overlay'), 'vice grade uses overlay');
});
check('renderCover draws grain when on and none when off', () => {
  const on = makeFakeCtx();
  const off = makeFakeCtx();
  renderCover(on, renderState({ grain: true }), 1080, 1080);
  renderCover(off, renderState({ grain: false }), 1080, 1080);
  assert(on.calls.length > off.calls.length, 'grain adds calls');
});
check('renderCover draws the vignette when on and skips it when off', () => {
  const on = makeFakeCtx();
  const off = makeFakeCtx();
  renderCover(on, renderState({ vignette: true }), 1080, 1080);
  renderCover(off, renderState({ vignette: false }), 1080, 1080);
  const radial = (ctx) => ctx.calls.filter((c) => c[0] === 'createRadialGradient').length;
  assertEq(radial(on), 2, 'sun glow + vignette');
  assertEq(radial(off), 1, 'sun glow only');
});
check('renderCover is deterministic: same state, same calls', () => {
  const a = makeFakeCtx();
  const b = makeFakeCtx();
  renderCover(a, renderState(), 1920, 1080);
  renderCover(b, renderState(), 1920, 1080);
  assertEq(JSON.stringify(a.calls), JSON.stringify(b.calls), 'identical call log');
  assertEq(JSON.stringify(a.sets), JSON.stringify(b.sets), 'identical property sets');
});
check('renderCover works at all three export sizes', () => {
  for (const [w, h] of SIZES) {
    const ctx = makeFakeCtx();
    renderCover(ctx, renderState(), w, h);
    const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
    assert(texts.includes('VICE CITY'), `headline at ${w}x${h}`);
  }
});
check('renderCover honours the ink colour', () => {
  const ctx = makeFakeCtx();
  renderCover(ctx, renderState({ ink: 'gold' }), 1080, 1080);
  assert(ctx.sets.some((s) => s[0] === 'fillStyle' && s[1] === '#ffd76a'), 'gold ink set');
});

// --- Shuffle ---------------------------------------------------------------------
check('shuffleState picks valid layout, grade and ink', () => {
  const rng = mulberry32(11);
  const next = shuffleState(renderState(), rng);
  assert(LAYOUTS.some((l) => l.id === next.layout), 'valid layout');
  assert(GRADES.some((g) => g.id === next.grade), 'valid grade');
  assert(INKS.some((i) => i.id === next.ink), 'valid ink');
  assert(next.gradeIntensity >= 55 && next.gradeIntensity < 100, 'intensity in range');
  assert(next.neonGlow >= 40 && next.neonGlow < 100, 'glow in range');
});
check('shuffleState is deterministic for the same seed', () => {
  const a = shuffleState(renderState(), mulberry32(5));
  const b = shuffleState(renderState(), mulberry32(5));
  assertEq(JSON.stringify(a), JSON.stringify(b), 'identical shuffle');
});
check('shuffleState makes one crop per frame of the new layout', () => {
  const next = shuffleState(renderState(), mulberry32(9));
  const frames = frameRects(next.layout, 1000, 1000).length;
  assertEq(next.crops.length, frames, 'crop count matches frames');
  for (const c of next.crops) {
    assert(c.zoom >= 1 && c.zoom <= 1.6, 'zoom in range');
    assert(c.panX >= -0.15 && c.panX <= 0.15, 'panX in range');
  }
});
check('shuffleState keeps the photos and headline', () => {
  const s = renderState();
  const next = shuffleState(s, mulberry32(3));
  assertEq(next.photos, s.photos, 'photos kept');
  assertEq(next.headline, s.headline, 'headline kept');
});

// --- Scenes ------------------------------------------------------------------------
check('parseScene defaults to the editor with VICE CITY', () => {
  const s = parseScene('');
  assertEq(s.scene, 'editor', 'scene');
  assertEq(s.headline, 'VICE CITY', 'headline');
  assertEq(s.layout, 'strip3', 'layout');
  assertEq(s.grade, 'vice', 'grade');
});
check('parseScene reads layout, grade, headline and tagline from the query', () => {
  const s = parseScene('?scene=cover&layout=grid4&grade=neon&headline=NEON%20RIDE&tagline=Drive%20all%20night');
  assertEq(s.scene, 'cover', 'scene');
  assertEq(s.layout, 'grid4', 'layout');
  assertEq(s.grade, 'neon', 'grade');
  assertEq(s.headline, 'NEON RIDE', 'headline');
  assertEq(s.tagline, 'Drive all night', 'tagline');
});
check('parseScene falls back to pier for an unknown photo name', () => {
  const s = parseScene('?photo=someone-else');
  assertEq(s.photo, 'pier', 'photo fallback');
  assertEq(s.photo2, 'boulevard', 'photo2 default');
});
check('parseScene reads both sample photos and the sliders', () => {
  const s = parseScene('?photo=boulevard&photo2=pier&intensity=40&glow=90');
  assertEq(s.photo, 'boulevard', 'photo');
  assertEq(s.photo2, 'pier', 'photo2');
  assertEq(s.intensity, 40, 'intensity');
  assertEq(s.glow, 90, 'glow');
});

// --- Extra geometry ------------------------------------------------------------
check('frameGap is 9px on a 1080 canvas', () => {
  assertEq(frameGap(1080, 1080), 9, 'gap');
});
check('strip3 bands have equal height and the gap between them', () => {
  const rects = frameRects('strip3', 1080, 1080);
  assertNear(rects[0].h, rects[1].h, 0.001, 'band heights equal');
  assertNear(rects[1].y - (rects[0].y + rects[0].h), frameGap(1080, 1080), 0.001, 'gap');
  assertEq(rects[0].w, 1080, 'full width');
});
check('grid4 quadrants are equal squares on a square canvas', () => {
  const rects = frameRects('grid4', 1080, 1080);
  for (const r of rects) assertNear(r.w, r.h, 0.001, 'square quadrant');
  assertNear(rects[0].w, rects[1].w, 0.001, 'equal widths');
});
check('split2 halves are equal and together span the width', () => {
  const rects = frameRects('split2', 1920, 1080);
  assertNear(rects[0].w, rects[1].w, 0.001, 'equal halves');
  assertNear(rects[0].w + frameGap(1920, 1080) + rects[1].w, 1920, 0.001, 'span width');
});
check('full bleed is exactly the canvas', () => {
  const [r] = frameRects('full', 1080, 1350);
  assertEq(r.x, 0, 'x');
  assertEq(r.y, 0, 'y');
  assertEq(r.w, 1080, 'w');
  assertEq(r.h, 1350, 'h');
});
check('placePhoto respects a frame offset from the origin', () => {
  const frame = { x: 200, y: 300, w: 500, h: 500 };
  const p = placePhoto(1000, 1000, frame, freshCrop(0));
  assertNear(p.dx, 200, 0.001, 'dx includes frame x');
  assertNear(p.dy, 300, 0.001, 'dy includes frame y');
});
check('placePhoto panY shifts the photo vertically', () => {
  const frame = { x: 0, y: 0, w: 1080, h: 1080 };
  const centred = placePhoto(1600, 900, frame, { photo: 0, zoom: 2, panX: 0, panY: 0 });
  const panned = placePhoto(1600, 900, frame, { photo: 0, zoom: 2, panX: 0, panY: 0.1 });
  assert(panned.dy > centred.dy, 'pan down moves the photo down');
});

// --- Extra grades ----------------------------------------------------------------
check('gradeWash passes the grade mode and sky through', () => {
  const wash = gradeWash(gradeById('pastel'), 80);
  assertEq(wash.mode, 'soft-light', 'mode');
  assertEq(wash.sky, '#3d2b52', 'sky');
  assertEq(wash.stops.length, 3, 'stops');
});
check('every grade wash is neutral at 0 and full at 100', () => {
  for (const g of GRADES) {
    assertEq(gradeWash(g, 0).alpha, 0, `${g.id} at 0`);
    assertEq(gradeWash(g, 100).alpha, g.strength, `${g.id} at 100`);
  }
});

// --- Extra renderer checks ---------------------------------------------------------
check('renderCover draws the neon rules as gradients', () => {
  const ctx = makeFakeCtx();
  renderCover(ctx, renderState(), 1080, 1080);
  const linear = ctx.calls.filter((c) => c[0] === 'createLinearGradient').length;
  assert(linear >= 3, 'grade wash + two neon rules');
});
check('renderCover alternates the two photos across grid4 frames', () => {
  const ctx = makeFakeCtx();
  const s = renderState({ layout: 'grid4' });
  s.crops = defaultCrops('grid4', 2);
  renderCover(ctx, s, 1080, 1080);
  const draws = ctx.calls.filter((c) => c[0] === 'drawImage');
  assertEq(draws.length, 4, 'four frames');
  assertEq(draws[0][1], s.photos[0], 'frame 0 photo 0');
  assertEq(draws[1][1], s.photos[1], 'frame 1 photo 1');
  assertEq(draws[2][1], s.photos[0], 'frame 2 photo 0');
  assertEq(draws[3][1], s.photos[1], 'frame 3 photo 1');
});
check('renderCover uppercases a lowercase headline', () => {
  const ctx = makeFakeCtx();
  renderCover(ctx, renderState({ headline: 'vice city' }), 1080, 1080);
  const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  assert(texts.includes('VICE CITY'), 'uppercased');
});
check('renderCover with an empty tagline draws only the headline', () => {
  const ctx = makeFakeCtx();
  renderCover(ctx, renderState({ tagline: '' }), 1080, 1080);
  const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  assertEq(texts.length, 1, 'one text call');
  assertEq(texts[0], 'VICE CITY', 'headline only');
});
check('renderCover uses soft-light for the pastel grade', () => {
  const ctx = makeFakeCtx();
  renderCover(ctx, renderState({ grade: 'pastel', gradeIntensity: 100 }), 1080, 1080);
  const modes = ctx.sets.filter((s) => s[0] === 'globalCompositeOperation').map((s) => s[1]);
  assert(modes.includes('soft-light'), 'pastel uses soft-light');
});
check('renderCover grain changes with the seed', () => {
  const a = makeFakeCtx();
  const b = makeFakeCtx();
  renderCover(a, renderState({ seed: 7 }), 1080, 1080);
  renderCover(b, renderState({ seed: 8 }), 1080, 1080);
  assert(JSON.stringify(a.calls) !== JSON.stringify(b.calls), 'different grain');
});
check('renderCover works for every layout', () => {
  for (const l of LAYOUTS) {
    const ctx = makeFakeCtx();
    const s = renderState({ layout: l.id });
    s.crops = defaultCrops(l.id, 2);
    renderCover(ctx, s, 1080, 1080);
    const draws = ctx.calls.filter((c) => c[0] === 'drawImage');
    assertEq(draws.length, l.frames, `${l.id} draws ${l.frames} photos`);
  }
});
check('coverStateDefaults returns a complete fresh state', () => {
  const s = coverStateDefaults();
  assertEq(s.layout, 'strip3', 'layout');
  assertEq(s.grade, 'vice', 'grade');
  assertEq(s.gradeIntensity, 80, 'intensity');
  assertEq(s.neonGlow, 70, 'glow');
  assertEq(s.vignette, true, 'vignette');
  assertEq(s.grain, true, 'grain');
  assertEq(s.headline, 'VICE CITY', 'headline');
  assertEq(s.photos.length, 3, 'three photo slots');
  assertEq(s.seed, 7, 'seed');
});

// --- Extra shuffle / PRNG ------------------------------------------------------------
check('mulberry32 works from seed 0', () => {
  const rng = mulberry32(0);
  const v = rng();
  assert(v >= 0 && v < 1, 'in range');
});
check('shuffleState differs for different seeds', () => {
  const a = shuffleState(renderState(), mulberry32(1));
  const b = shuffleState(renderState(), mulberry32(2));
  assert(JSON.stringify(a) !== JSON.stringify(b), 'different shuffle');
});
check('shuffleState never picks a photo slot with no photo', () => {
  const s = renderState();
  s.photos = [fakePhoto(800, 600), null, null];
  const next = shuffleState(s, mulberry32(21));
  assert(next.crops.every((c) => c.photo === 0), 'only photo 0 exists');
});

// --- Extra scenes ----------------------------------------------------------------------
check('parseScene reads the ink and the scene', () => {
  const s = parseScene('?scene=cover&ink=gold');
  assertEq(s.scene, 'cover', 'scene');
  assertEq(s.ink, 'gold', 'ink');
});
check('parseScene keeps an unknown layout string for the app to fall back on', () => {
  const s = parseScene('?layout=banana');
  assertEq(s.layout, 'banana', 'passed through');
  assertEq(layoutById(s.layout).id, 'strip3', 'app falls back to strip3');
});

// --- Summary -------------------------------------------------------------------------
console.log(`${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`FAIL: ${f}`);
  process.exit(1);
}
