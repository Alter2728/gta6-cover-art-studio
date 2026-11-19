// Node headless tests for Sunset Cover Studio's pure geometry, grades and
// renderer. Run: node tools/test-cover.mjs — exits 1 on any failure.
// The renderer is exercised against a fake 2D context that records calls,
// so the draw path is tested without a browser.
import {
  PANEL_LAYOUTS, labelForLayout, frameCountFor, rectsFor, placePhoto,
  limitZoom, limitShift, shrinkCaption, hitPanel, gapFor,
} from '../app/src/layouts.mjs';
import { GRADE_LIST, gradeLookup, gradeFilter, tintAlpha, TITLE_INKS, TITLE_INK_IDS, HEADLINE_PRESETS, inkLookup } from '../app/src/grades.mjs';
import { renderPoster, EXPORT_PRESETS } from '../app/src/cover.mjs';

const SIZES = [
  { w: 1080, h: 1080 },
  { w: 1080, h: 1350 },
  { w: 1920, h: 1080 },
];
let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.log(`FAIL ${name} ${detail}`); }
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// A stand-in for CanvasRenderingContext2D: every method the renderer calls
// exists, gradients accept stops, measureText returns a width that grows
// with the font size, and every call is logged for inspection.
function fakeContext() {
  const calls = [];
  const gradient = {
    addColorStop() {},
  };
  return {
    calls,
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textAlign: '',
    textBaseline: '',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    filter: 'none',
    globalAlpha: 1,
    letterSpacing: '0px',
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    beginPath() { calls.push('beginPath'); },
    rect() { calls.push('rect'); },
    clip() { calls.push('clip'); },
    fillRect() { calls.push('fillRect'); },
    strokeRect() { calls.push('strokeRect'); },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
    drawImage() { calls.push('drawImage'); },
    fillText(text) { calls.push(`fillText:${text}`); },
    strokeText(text) { calls.push(`strokeText:${text}`); },
    measureText(text) {
      const size = Number.parseFloat(this.font) || 16;
      return { width: text.length * size * 0.6 };
    },
  };
}

function fakePhoto(w, h) {
  return { naturalWidth: w, naturalHeight: h };
}

// 1. Frame rectangles for all 4 arrangements at all 3 export sizes.
for (const layout of PANEL_LAYOUTS) {
  for (const { w, h } of SIZES) {
    const rects = rectsFor(layout.id, w, h);
    check(`rects ${layout.id} ${w}x${h} has ${layout.frames} frames`, rects.length === layout.frames);
    let inside = true;
    let area = 0;
    for (const r of rects) {
      if (r.x < 0 || r.y < 0 || r.x + r.w > w || r.y + r.h > h || r.w <= 0 || r.h <= 0) inside = false;
      area += r.w * r.h;
    }
    check(`rects ${layout.id} ${w}x${h} inside cover`, inside);
    let noOverlap = true;
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        if (overlaps(rects[i], rects[j])) noOverlap = false;
      }
    }
    check(`rects ${layout.id} ${w}x${h} do not overlap`, noOverlap);
    check(`rects ${layout.id} ${w}x${h} cover >=85% of area`, area >= 0.85 * w * h, `area=${area} of ${w * h}`);
  }
}

check('labelForLayout names strip3', labelForLayout('strip3').includes('3'));
check('labelForLayout falls back for unknown ids', labelForLayout('nope') === labelForLayout('strip3'));
check('frameCountFor grid4 is 4', frameCountFor('grid4') === 4);
check('frameCountFor full is 1', frameCountFor('full') === 1);

// strip3's top band is the tallest, like the classic poster.
{
  const rows = rectsFor('strip3', 1920, 1080);
  check('strip3 top band tallest', rows[0].h > rows[1].h && rows[0].h > rows[2].h);
  check('strip3 bands stack with one gap between them', Math.abs((rows[0].y + rows[0].h + gapFor(1920, 1080)) - rows[1].y) < 1);
}

// 2. Photo placement / zoom math.
{
  const frame = { x: 0, y: 0, w: 800, h: 400 };
  // Wide photo (1600x400) into an 800x400 frame, cover: base is the larger
  // ratio (400/400=1), so it spans the height exactly and crops the sides.
  const cover = placePhoto(1600, 400, frame, 1, 0, 0, 'cover');
  check('cover fills frame height', Math.abs(cover.h - 400) < 0.01 && cover.w >= 800 - 0.01, JSON.stringify(cover));
  // Contain: scales by min(800/1600, 400/400)=0.5 -> 800x200, centred.
  const contain = placePhoto(1600, 400, frame, 1, 0, 0, 'contain');
  check('contain shows whole photo', Math.abs(contain.w - 800) < 0.01 && Math.abs(contain.h - 200) < 0.01, JSON.stringify(contain));
  // Zoom doubles the drawn size around the frame centre.
  const zoomed = placePhoto(1600, 400, frame, 2, 0, 0, 'cover');
  check('zoom 2x doubles drawn size', Math.abs(zoomed.w - 3200) < 0.01);
  // Pan shifts the drawn rect by the offset, as a fraction of frame size:
  // dx 0.05 on an 800-wide frame moves the photo 40 px right.
  const panned = placePhoto(1600, 400, frame, 1, 0.05, -0.05, 'cover');
  check('pan shifts drawn rect', Math.abs(panned.x - (cover.x + 40)) < 0.01 && Math.abs(panned.y - (cover.y - 20)) < 0.01);
  // Tall photo into a wide frame, cover: base is the larger ratio
  // (800/400=2), so it spans the width exactly and crops top and bottom.
  const tall = placePhoto(400, 1600, frame, 1, 0, 0, 'cover');
  check('cover tall photo spans frame width', Math.abs(tall.w - 800) < 0.01 && tall.h >= 400 - 0.01, JSON.stringify(tall));
}
check('limitZoom clamps below 0.5', limitZoom(0.1) === 0.5);
check('limitZoom clamps above 4', limitZoom(9) === 4);
check('limitZoom keeps 1.5', limitZoom(1.5) === 1.5);
check('limitShift clamps an extreme offset', limitShift(9, 1) === 0.25);
check('limitShift allows more slack when zoomed in', limitShift(0.9, 4) === 0.9);
check('limitShift keeps a small offset', limitShift(0.1, 1) === 0.1);

// 3. Headline auto-fit: a long headline shrinks until it fits.
{
  const measure = (text, px) => text.length * px * 0.6;
  const short = shrinkCaption(measure, 'VICE', 500, 100, 14);
  check('short headline keeps start size', short === 100, `got ${short}`);
  const long = shrinkCaption(measure, 'A VERY LONG HEADLINE THAT KEEPS GOING ON', 500, 100, 14);
  check('long headline shrinks to fit', long < 100 && measure('A VERY LONG HEADLINE THAT KEEPS GOING ON', long) <= 500, `got ${long}`);
  const tiny = shrinkCaption(measure, 'X'.repeat(200), 100, 100, 14);
  check('headline never shrinks below the floor', tiny >= 14, `got ${tiny}`);
}

// 4. Grades: at least 4, each with filter parts and tint layers; the
// intensity slider blends the filter toward neutral and scales the tints.
check('at least 4 grades', GRADE_LIST.length >= 4, `got ${GRADE_LIST.length}`);
for (const g of GRADE_LIST) {
  check(`grade ${g.id} has filter parts and tints`, typeof g.parts.saturate === 'number' && Array.isArray(g.tints) && g.tints.length > 0);
}
check('gradeLookup finds neon', gradeLookup('neon').id === 'neon');
check('gradeLookup falls back for unknown ids', gradeLookup('nope').id === GRADE_LIST[0].id);
{
  const full = gradeFilter(gradeLookup('sunset'), 1);
  const off = gradeFilter(gradeLookup('sunset'), 0);
  check('grade filter at full strength is not neutral', full.includes('saturate(1.350)'), full);
  check('grade filter at zero strength is neutral', off === 'saturate(1.000) contrast(1.000) brightness(1.000)', off);
  const layer = gradeLookup('sunset').tints[0];
  check('tint alpha scales with strength', Math.abs(tintAlpha(layer, 0.5) - layer.alpha * 0.5) < 1e-9);
  check('tint alpha is zero at zero strength', tintAlpha(layer, 0) === 0);
}
check('headline inks cover white/sunset/neon/gold', ['white', 'sunset', 'neon', 'gold'].every((id) => id in TITLE_INKS));
check('inkLookup finds neon', inkLookup('neon').gradient?.length === 3);
check('inkLookup falls back to white for unknown ids', inkLookup('nope').fill === '#ffffff');
check('placePhoto guards zero-size photos', placePhoto(0, 0, { x: 0, y: 0, w: 800, h: 400 }, 1, 0, 0, 'cover').w === 0);
check('at least 3 headline presets', HEADLINE_PRESETS.length >= 3);
check('every headline preset has a headline and a tagline', HEADLINE_PRESETS.every((p) => p.headline && p.tagline));

// 5. Export presets: exactly the three sizes the bounty asks for.
check('three export presets', EXPORT_PRESETS.length === 3);
for (const want of [{ id: 'square', w: 1080, h: 1080 }, { id: 'portrait', w: 1080, h: 1350 }, { id: 'wide', w: 1920, h: 1080 }]) {
  const found = EXPORT_PRESETS.find((s) => s.id === want.id);
  check(`export preset ${want.id} is ${want.w}x${want.h}`, found?.w === want.w && found?.h === want.h);
}

// 6. Hit-testing: a point in the middle band of strip3 finds frame 1.
{
  const rects = rectsFor('strip3', 1080, 1080);
  const mid = rects[1];
  check('hitPanel finds the middle frame', hitPanel(rects, mid.x + mid.w / 2, mid.y + mid.h / 2) === 1);
  check('hitPanel returns -1 outside every frame', hitPanel(rects, 1, 1) === -1);
}

// 7. The renderer, against the fake context: it draws one photo per frame,
// paints the headline and the tagline, and never throws on an empty poster.
{
  const poster = {
    arrangement: 'strip3', tint: 'sunset', tintStrength: 1, glow: 0.6,
    grain: true, vignette: true, outerFrame: true,
    headline: 'VICE CITY', tagline: 'A Sunset Story', headlineScale: 11,
    headlineSide: 'bottom', ink: 'sunset', inkOutline: true,
    pictures: [fakePhoto(1200, 800)],
    frames: [
      { picture: 0, zoom: 1, dx: 0, dy: 0, mode: 'cover' },
      { picture: 0, zoom: 1.4, dx: -0.09, dy: 0.06, mode: 'cover' },
      { picture: 0, zoom: 1.25, dx: 0.07, dy: -0.05, mode: 'cover' },
    ],
  };
  const ctx = fakeContext();
  renderPoster(ctx, poster, 1080, 1080);
  const draws = ctx.calls.filter((c) => c === 'drawImage').length;
  check('renderer draws one photo per frame', draws === 3, `drew ${draws}`);
  check('renderer paints the headline', ctx.calls.some((c) => c === 'fillText:VICE CITY'));
  check('renderer paints the tagline', ctx.calls.some((c) => c === 'fillText:A SUNSET STORY'));
  check('renderer strokes the headline outline', ctx.calls.some((c) => c === 'strokeText:VICE CITY'));
}
{
  const empty = {
    arrangement: 'grid4', tint: 'neon', tintStrength: 0.5, glow: 0,
    grain: false, vignette: false, outerFrame: false,
    headline: '', tagline: '', headlineScale: 11, headlineSide: 'top',
    ink: 'white', inkOutline: false, pictures: [], frames: [],
  };
  const ctx = fakeContext();
  let threw = null;
  try { renderPoster(ctx, empty, 1920, 1080); } catch (e) { threw = e; }
  check('renderer survives an empty poster', threw === null, String(threw));
  check('renderer draws no photo with no pictures', ctx.calls.filter((c) => c === 'drawImage').length === 0);
  check('renderer paints the empty-frame hint, not a headline', ctx.calls.some((c) => c === 'fillText:Drop a photo here'));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
