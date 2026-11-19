// Node headless tests for Sunset Cover Studio's pure geometry and grades.
// Run: node tools/test-cover.mjs — exits 1 on any failure.
import {
  LAYOUTS, layoutPanels, coverTransform, clampZoom, clampPan,
  fitCaptionSize, panelAt, panelGap,
} from '../app/src/layouts.mjs';
import { GRADES, gradeById, CAPTION_PAINTS } from '../app/src/grades.mjs';

const SIZES = [
  { w: 1080, h: 1080 },
  { w: 1080, h: 1350 },
  { w: 1920, h: 1080 },
];
let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`PASS ${name}`); }
  else { failed++; console.log(`FAIL ${name} ${detail}`); }
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// 1. Layout panel-rect math for all 4 layouts at all 3 export sizes.
for (const layout of LAYOUTS) {
  for (const { w, h } of SIZES) {
    const rects = layoutPanels(layout, w, h);
    const expected = { strip3: 3, full: 1, split2: 2, grid4: 4 }[layout];
    check(`layout ${layout} ${w}x${h} has ${expected} panels`, rects.length === expected);
    let inside = true;
    let area = 0;
    for (const r of rects) {
      if (r.x < 0 || r.y < 0 || r.x + r.w > w || r.y + r.h > h || r.w <= 0 || r.h <= 0) inside = false;
      area += r.w * r.h;
    }
    check(`layout ${layout} ${w}x${h} rects inside cover`, inside);
    let noOverlap = true;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (overlaps(rects[i], rects[j])) noOverlap = false;
      }
    }
    check(`layout ${layout} ${w}x${h} rects do not overlap`, noOverlap);
    // Panels must cover most of the cover (gaps are thin).
    check(`layout ${layout} ${w}x${h} covers >=85% of area`, area >= 0.85 * w * h, `area=${area} of ${w * h}`);
  }
}

// Strip3's top panel is the tallest, like the classic poster.
{
  const rows = layoutPanels('strip3', 1920, 1080);
  check('strip3 top panel tallest', rows[0].h > rows[1].h && rows[0].h > rows[2].h);
  check('strip3 rows stack without gaps beyond the panel gap', Math.abs((rows[0].y + rows[0].h + panelGap(1920, 1080)) - rows[1].y) < 1);
}

// 2. Cover-fit / zoom math.
{
  const rect = { x: 0, y: 0, w: 800, h: 400 };
  // Wide photo (1600x400) into a 800x400 panel, fill: base is the larger
  // ratio (400/400=1), so it covers the height exactly and crops the sides.
  const fill = coverTransform(1600, 400, rect, 1, 0, 0, 'fill');
  check('fill covers panel height', Math.abs(fill.dh - 400) < 0.01 && fill.dw >= 800 - 0.01, JSON.stringify(fill));
  // Fit: whole photo visible, height 400, width 1600 -> scaled to 400 high? No:
  // fit scales by min(800/1600, 400/400)=0.5 -> 800x200, centred vertically.
  const fit = coverTransform(1600, 400, rect, 1, 0, 0, 'fit');
  check('fit shows whole photo', Math.abs(fit.dw - 800) < 0.01 && Math.abs(fit.dh - 200) < 0.01, JSON.stringify(fit));
  // Zoom doubles the drawn size around the panel centre.
  const zoomed = coverTransform(1600, 400, rect, 2, 0, 0, 'fill');
  check('zoom 2x doubles drawn size', Math.abs(zoomed.dw - 3200) < 0.01);
  // Pan shifts the drawn rect by the offset, as a fraction of panel size:
  // ox 0.05 on an 800-wide panel moves the photo 40 px right.
  const panned = coverTransform(1600, 400, rect, 1, 0.05, -0.05, 'fill');
  check('pan shifts drawn rect', Math.abs(panned.dx - (fill.dx + 40)) < 0.01 && Math.abs(panned.dy - (fill.dy - 20)) < 0.01);
  // Tall photo into a wide panel, fill: base is the larger ratio (800/400=2),
  // so it covers the width exactly and crops top and bottom.
  const tall = coverTransform(400, 1600, rect, 1, 0, 0, 'fill');
  check('fill tall photo covers panel width', Math.abs(tall.dw - 800) < 0.01 && tall.dh >= 400 - 0.01, JSON.stringify(tall));
}
check('clampZoom clamps below 0.5', clampZoom(0.1) === 0.5);
check('clampZoom clamps above 4', clampZoom(9) === 4);
check('clampZoom keeps 1.5', clampZoom(1.5) === 1.5);
check('clampPan clamps an extreme offset', clampPan(9, 1) === 0.25);
check('clampPan allows more slack when zoomed in', clampPan(0.9, 4) === 0.9);
check('clampPan keeps a small offset', clampPan(0.1, 1) === 0.1);

// 3. Caption auto-fit: a long caption shrinks until it fits.
{
  // Fake measurer: width grows linearly with size, 0.6px per char per px.
  const measure = (text, px) => text.length * px * 0.6;
  const short = fitCaptionSize(measure, 'SUNSET', 500, 100, 14);
  check('short caption keeps start size', short === 100, `got ${short}`);
  const long = fitCaptionSize(measure, 'A VERY LONG CAPTION THAT KEEPS GOING ON', 500, 100, 14);
  check('long caption shrinks to fit', long < 100 && measure('A VERY LONG CAPTION THAT KEEPS GOING ON', long) <= 500, `got ${long}`);
  const tiny = fitCaptionSize(measure, 'X'.repeat(200), 100, 100, 14);
  check('caption never shrinks below the minimum', tiny >= 14, `got ${tiny}`);
}

// 4. Grades: at least 4, each with a filter and overlays; caption paints exist.
check('at least 4 grades', GRADES.length >= 4, `got ${GRADES.length}`);
for (const g of GRADES) {
  check(`grade ${g.id} has a filter and overlays`, typeof g.filter === 'string' && g.filter.length > 0 && Array.isArray(g.overlays) && g.overlays.length > 0);
}
check('gradeById finds neon', gradeById('neon').id === 'neon');
check('gradeById falls back for unknown ids', gradeById('nope').id === GRADES[0].id);
check('caption paints cover white/sunset/neon/gold', ['white', 'sunset', 'neon', 'gold'].every((id) => id in CAPTION_PAINTS));

// 5. Hit-testing: a point in the middle panel of strip3 finds panel 1.
{
  const rects = layoutPanels('strip3', 1080, 1080);
  const mid = rects[1];
  check('panelAt finds the middle panel', panelAt(rects, mid.x + mid.w / 2, mid.y + mid.h / 2) === 1);
  check('panelAt returns -1 outside every panel', panelAt(rects, 1, 1) === -1);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
