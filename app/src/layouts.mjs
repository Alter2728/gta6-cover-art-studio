// Panel layouts and photo placement for Sunset Cover Studio.
//
// A cover is one canvas split into frames. Each frame holds one photo, cropped
// to cover the frame (like CSS object-fit: cover) with a zoom and a pan offset
// the user drags, scrolls or nudges. All geometry here is pure: given a canvas
// size it returns pixel rects, so the unit tests can check every layout at
// every export size without a browser.

export const LAYOUTS = [
  { id: 'strip3', name: 'Sunset Strip', frames: 3 },
  { id: 'full', name: 'Full Bleed', frames: 1 },
  { id: 'split2', name: 'Split Screen', frames: 2 },
  { id: 'grid4', name: 'Four Corners', frames: 4 },
];

/** Looks a layout up by id, falling back to the first layout. */
export function layoutById(id) {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

/** Gap between frames, in pixels, scaled to the canvas. */
export function frameGap(width, height) {
  return Math.max(2, Math.round(Math.min(width, height) * 0.008));
}

/**
 * The frames of a layout on a canvas of width x height.
 * Frames tile the canvas with a thin gap between them and never overlap.
 */
export function frameRects(layoutId, width, height) {
  const gap = frameGap(width, height);
  const g = gap;
  switch (layoutId) {
    case 'full':
      return [{ x: 0, y: 0, w: width, h: height }];
    case 'split2': {
      const half = (width - g) / 2;
      return [
        { x: 0, y: 0, w: half, h: height },
        { x: half + g, y: 0, w: half, h: height },
      ];
    }
    case 'grid4': {
      const halfW = (width - g) / 2;
      const halfH = (height - g) / 2;
      return [
        { x: 0, y: 0, w: halfW, h: halfH },
        { x: halfW + g, y: 0, w: halfW, h: halfH },
        { x: 0, y: halfH + g, w: halfW, h: halfH },
        { x: halfW + g, y: halfH + g, w: halfW, h: halfH },
      ];
    }
    case 'strip3':
    default: {
      const third = (height - 2 * g) / 3;
      return [
        { x: 0, y: 0, w: width, h: third },
        { x: 0, y: third + g, w: width, h: third },
        { x: 0, y: 2 * (third + g), w: width, h: third },
      ];
    }
  }
}

/** Which frame, if any, contains the point (x, y). Returns -1 outside. */
export function frameAt(layoutId, width, height, x, y) {
  const rects = frameRects(layoutId, width, height);
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
  }
  return -1;
}

/**
 * A fresh crop for one frame: which photo slot it shows, at what zoom, and
 * how far it is panned. Pan is a fraction of the frame size, 0 = centred.
 */
export function freshCrop(photoIndex) {
  return { photo: photoIndex, zoom: 1, panX: 0, panY: 0 };
}

/**
 * Default crops for a layout: frames take turns through the loaded photos,
 * so two photos alternate across the panels.
 */
export function defaultCrops(layoutId, photoCount) {
  const count = layoutById(layoutId).frames;
  const crops = [];
  for (let i = 0; i < count; i += 1) {
    crops.push(freshCrop(photoCount > 0 ? i % photoCount : 0));
  }
  return crops;
}

/** Clamps a number into [lo, hi]. */
export function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Where a photo of natural size (imgW x imgH) is drawn inside a frame, given
 * its crop. Cover-fit: the photo always fills the frame, zoomed by
 * crop.zoom, panned by crop.panX / crop.panY (fractions of the frame size).
 * The pan is clamped so the photo can never be dragged off the frame.
 */
export function placePhoto(imgW, imgH, frame, crop) {
  const base = Math.max(frame.w / imgW, frame.h / imgH);
  const zoom = Math.max(1, crop.zoom);
  const dw = imgW * base * zoom;
  const dh = imgH * base * zoom;
  const maxPanX = dw > frame.w ? (dw - frame.w) / 2 / frame.w : 0;
  const maxPanY = dh > frame.h ? (dh - frame.h) / 2 / frame.h : 0;
  const panX = clamp(crop.panX, -maxPanX, maxPanX);
  const panY = clamp(crop.panY, -maxPanY, maxPanY);
  return {
    dx: frame.x + (frame.w - dw) / 2 + panX * frame.w,
    dy: frame.y + (frame.h - dh) / 2 + panY * frame.h,
    dw,
    dh,
  };
}

/** One arrow-key nudge: moves a crop's pan by a small step, clamped. */
export function nudgeCrop(crop, direction, step = 0.02) {
  const next = { ...crop };
  if (direction === 'left') next.panX -= step;
  if (direction === 'right') next.panX += step;
  if (direction === 'up') next.panY -= step;
  if (direction === 'down') next.panY += step;
  // Pan limits depend on the zoom; keep the raw value in a sane band and let
  // placePhoto clamp the rest.
  next.panX = clamp(next.panX, -0.5, 0.5);
  next.panY = clamp(next.panY, -0.5, 0.5);
  return next;
}

/** Zooms a crop by a factor, keeping zoom inside [1, 4]. */
export function zoomCrop(crop, factor) {
  return { ...crop, zoom: clamp(crop.zoom * factor, 1, 4) };
}
