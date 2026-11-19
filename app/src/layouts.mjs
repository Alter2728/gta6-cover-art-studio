// Panel geometry for Sunset Cover Studio (round 2).
//
// Everything in here is pure arithmetic — no DOM, no canvas — so the Node
// test suite can import it directly. A "frame" is one photo slot on the
// cover; a "layout" (called an arrangement in the editor) decides how many
// frames there are and where each one sits.

export const PANEL_LAYOUTS = [
  { id: 'strip3', name: 'Comic strip · 3', frames: 3 },
  { id: 'full', name: 'Full bleed · 1', frames: 1 },
  { id: 'split2', name: 'Split · 2', frames: 2 },
  { id: 'grid4', name: 'Grid · 2×2', frames: 4 },
];

export function labelForLayout(id) {
  const found = PANEL_LAYOUTS.find((entry) => entry.id === id);
  return found ? found.name : PANEL_LAYOUTS[0].name;
}

export function frameCountFor(id) {
  const found = PANEL_LAYOUTS.find((entry) => entry.id === id);
  return found ? found.frames : PANEL_LAYOUTS[0].frames;
}

// The thin dark gutter between frames, in cover pixels. It grows with the
// cover so the gap looks the same at 1080 and at 1920 wide.
export function gapFor(width, height) {
  return Math.max(4, Math.round(Math.min(width, height) * 0.009));
}

// Frame rectangles for an arrangement on a cover of width × height.
// Each rectangle is { x, y, w, h } in cover pixels, inset by the gutter,
// never overlapping another frame, never spilling off the cover.
export function rectsFor(arrangement, width, height) {
  const g = gapFor(width, height);
  const innerW = width - 2 * g;
  const innerH = height - 2 * g;

  if (arrangement === 'full') {
    return [{ x: g, y: g, w: innerW, h: innerH }];
  }
  if (arrangement === 'split2') {
    const half = (innerW - g) / 2;
    return [
      { x: g, y: g, w: half, h: innerH },
      { x: g + half + g, y: g, w: half, h: innerH },
    ];
  }
  if (arrangement === 'grid4') {
    const halfW = (innerW - g) / 2;
    const halfH = (innerH - g) / 2;
    return [
      { x: g, y: g, w: halfW, h: halfH },
      { x: g + halfW + g, y: g, w: halfW, h: halfH },
      { x: g, y: g + halfH + g, w: halfW, h: halfH },
      { x: g + halfW + g, y: g + halfH + g, w: halfW, h: halfH },
    ];
  }

  // strip3 — the poster classic: three stacked bands, the top one tallest,
  // like the panels of a comic strip.
  const shares = [0.38, 0.31, 0.31];
  const bands = [];
  let top = g;
  for (const share of shares) {
    const bandH = (innerH - 2 * g) * share;
    bands.push({ x: g, y: top, w: innerW, h: bandH });
    top += bandH + g;
  }
  return bands;
}

// Where a photo of imgW × imgH is drawn inside a frame rectangle.
// zoom 1 is the base size; dx/dy shift the photo as fractions of the frame
// (so a crop survives when the cover is exported at another size); mode is
// 'cover' (crop to fill the frame) or 'contain' (show the whole photo).
// Returns the destination rectangle for drawImage.
export function placePhoto(imgW, imgH, frame, zoom, dx, dy, mode) {
  if (imgW <= 0 || imgH <= 0 || frame.w <= 0 || frame.h <= 0) {
    return { x: frame.x, y: frame.y, w: 0, h: 0 };
  }
  const base = mode === 'contain'
    ? Math.min(frame.w / imgW, frame.h / imgH)
    : Math.max(frame.w / imgW, frame.h / imgH);
  const dw = imgW * base * zoom;
  const dh = imgH * base * zoom;
  return {
    x: frame.x + (frame.w - dw) / 2 + dx * frame.w,
    y: frame.y + (frame.h - dh) / 2 + dy * frame.h,
    w: dw,
    h: dh,
  };
}

// The zoom the sliders and the mouse wheel allow: half size to 4×.
export function limitZoom(value) {
  return Math.min(4, Math.max(0.5, value));
}

// How far a photo may be dragged inside its frame: a quarter of the frame
// either way at zoom 1, and more the further it is zoomed in.
export function limitShift(value, zoom) {
  const slack = (zoom - 1) / 2 + 0.25;
  return Math.min(slack, Math.max(-slack, value));
}

// Shrink a headline until it fits maxWidth. measure(text, px) returns the
// text width at that pixel size; start is the first size tried, floor the
// smallest size allowed.
export function shrinkCaption(measure, text, maxWidth, start, floor) {
  let size = start;
  while (size > floor && measure(text, size) > maxWidth) {
    size = Math.max(floor, size * 0.94);
  }
  return size;
}

// Which frame, if any, contains the point (x, y) in cover pixels.
export function hitPanel(rects, x, y) {
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
  }
  return -1;
}
