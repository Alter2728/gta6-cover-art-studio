// Panel layouts and per-panel crops for Sunset Cover Studio.
// A layout tiles the canvas with frames separated by a thin gap; a crop
// says which photo a panel shows and how it is zoomed and panned inside
// that frame. Crops are stored as fractions of the frame, so the same crop
// draws the same way at preview size and at every export size.

import { GRADES, INKS } from './grades.mjs';

/** The four panel layouts: how many panels each one has and its name. */
export const LAYOUTS = {
  strip3: { id: 'strip3', name: 'Sunset Strip', panels: 3, kind: 'strip' },
  full1: { id: 'full1', name: 'Full Bleed', panels: 1, kind: 'full' },
  split2: { id: 'split2', name: 'Split Screen', panels: 2, kind: 'split' },
  grid4: { id: 'grid4', name: 'Four Corners', panels: 4, kind: 'grid' },
};

/** The layout for an id, falling back to Sunset Strip for an unknown id. */
export function layoutById(id) {
  return LAYOUTS[id] ?? LAYOUTS.strip3;
}

/** Clamps a number into [min, max]. */
export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** The gap between frames: at least 2 px, 0.8% of the canvas's short side. */
export function frameGap(w, h) {
  return Math.max(2, Math.round(Math.min(w, h) * 0.008));
}

/** Splits `total` into `n` integer lengths separated by `gap`, tiling exactly. */
function splitLengths(total, n, gap) {
  const base = Math.floor((total - (n - 1) * gap) / n);
  const out = [];
  let used = 0;
  for (let i = 0; i < n; i++) {
    const len = i === n - 1 ? total - (n - 1) * gap - used : base;
    out.push(len);
    used += len;
  }
  return out;
}

/**
 * The frame rectangles for a layout on a canvas of w × h: each {x, y, w, h}.
 * Frames tile the canvas with the frame gap between them and never overlap.
 */
export function frameRects(layoutId, w, h) {
  const layout = layoutById(layoutId);
  const g = frameGap(w, h);
  if (layout.kind === 'full') return [{ x: 0, y: 0, w, h }];
  if (layout.kind === 'strip') {
    const hs = splitLengths(h, 3, g);
    let y = 0;
    return hs.map((hh) => {
      const r = { x: 0, y, w, h: hh };
      y += hh + g;
      return r;
    });
  }
  if (layout.kind === 'split') {
    const ws = splitLengths(w, 2, g);
    let x = 0;
    return ws.map((ww) => {
      const r = { x, y: 0, w: ww, h };
      x += ww + g;
      return r;
    });
  }
  const ws = splitLengths(w, 2, g);
  const hs = splitLengths(h, 2, g);
  const out = [];
  let y = 0;
  for (const hh of hs) {
    let x = 0;
    for (const ww of ws) {
      out.push({ x, y, w: ww, h: hh });
      x += ww + g;
    }
    y += hh + g;
  }
  return out;
}

/** The index of the frame holding point (x, y), or -1 when it holds none. */
export function frameAt(layoutId, w, h, x, y) {
  const frames = frameRects(layoutId, w, h);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h) return i;
  }
  return -1;
}

/** A fresh crop: no zoom, no pan, showing the first photo. */
export function freshCrop() {
  return { photoIndex: 0, zoom: 1, ox: 0, oy: 0 };
}

/**
 * The default crops for a layout: frames take turns through the loaded
 * photos, so two photos alternate across the panels.
 */
export function defaultCrops(layoutId, photoCount) {
  const n = layoutById(layoutId).panels;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ photoIndex: photoCount > 0 ? i % photoCount : 0, zoom: 1, ox: 0, oy: 0 });
  }
  return out;
}

/**
 * Where a photo lands inside a frame: the drawImage destination rect.
 * The photo is cover-fit (it always fills the frame), scaled by the crop's
 * zoom and shifted by its pan, which is a fraction of the frame's size.
 */
export function placePhoto(photoW, photoH, frame, crop) {
  const base = Math.max(frame.w / photoW, frame.h / photoH);
  const dw = photoW * base * crop.zoom;
  const dh = photoH * base * crop.zoom;
  const dx = frame.x + (frame.w - dw) / 2 + crop.ox * frame.w;
  const dy = frame.y + (frame.h - dh) / 2 + crop.oy * frame.h;
  return { dx, dy, dw, dh };
}

/**
 * Clamps a crop so the photo can never be dragged off its frame: zoom in
 * [1, 4], and the pan no further than the photo's overhang past the frame.
 */
export function clampCrop(crop, photoW, photoH, frame) {
  const zoom = clamp(crop.zoom, 1, 4);
  const placed = placePhoto(photoW, photoH, frame, { ...crop, zoom });
  const maxOx = Math.max(0, (placed.dw - frame.w) / 2) / frame.w;
  const maxOy = Math.max(0, (placed.dh - frame.h) / 2) / frame.h;
  return {
    photoIndex: crop.photoIndex,
    zoom,
    ox: clamp(crop.ox, -maxOx, maxOx),
    oy: clamp(crop.oy, -maxOy, maxOy),
  };
}

/** Nudges a crop's pan by (dx, dy) fractions of the frame, then clamps it. */
export function nudgeCrop(crop, photoW, photoH, frame, dx, dy) {
  return clampCrop({ ...crop, ox: crop.ox + dx, oy: crop.oy + dy }, photoW, photoH, frame);
}

/** Zooms a crop by a factor around the frame's centre, then clamps it. */
export function zoomCrop(crop, photoW, photoH, frame, factor) {
  return clampCrop({ ...crop, zoom: crop.zoom * factor }, photoW, photoH, frame);
}

/** Picks one item from an array with a random function returning [0, 1). */
function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

/**
 * A shuffled configuration: a random layout, grade and ink, and a random
 * crop per panel. Given the same seeded rng it returns the same result.
 */
export function shufflePick(rng) {
  const layout = pick(rng, Object.keys(LAYOUTS));
  const grade = pick(rng, Object.keys(GRADES));
  const ink = pick(rng, Object.keys(INKS));
  const panels = LAYOUTS[layout].panels;
  const crops = [];
  for (let i = 0; i < panels; i++) {
    crops.push({
      photoIndex: Math.floor(rng() * 3),
      zoom: 1 + rng() * 1.5,
      ox: (rng() * 2 - 1) * 0.1,
      oy: (rng() * 2 - 1) * 0.1,
    });
  }
  return { layout, grade, ink, crops };
}
