// Panel geometry for Sunset Cover Studio: where each photo panel sits on a
// cover of any size, and how a photo is placed inside its panel.
// Pure functions with no DOM in them, so the Node tests can import this file.

export const LAYOUTS = ['strip3', 'full', 'split2', 'grid4'];

export const LAYOUT_LABELS = {
  strip3: 'Comic strip (3 panels)',
  full: 'Full bleed (1 photo)',
  split2: 'Split (2 panels)',
  grid4: 'Grid (2 x 2)',
};

/** Gap between panels, in cover pixels, growing with the cover. */
export function panelGap(width, height) {
  return Math.max(4, Math.round(Math.min(width, height) * 0.008));
}

/**
 * Rects for a layout on a cover of width x height.
 * Every rect is { x, y, w, h } in cover pixels, inset by the panel gap so a
 * dark frame shows between panels, and never overlapping another rect.
 */
export function layoutPanels(layout, width, height) {
  const g = panelGap(width, height);
  const innerW = width - 2 * g;
  const innerH = height - 2 * g;
  if (layout === 'full') {
    return [{ x: g, y: g, w: innerW, h: innerH }];
  }
  if (layout === 'split2') {
    const w = (innerW - g) / 2;
    return [
      { x: g, y: g, w, h: innerH },
      { x: g + w + g, y: g, w, h: innerH },
    ];
  }
  if (layout === 'grid4') {
    const w = (innerW - g) / 2;
    const h = (innerH - g) / 2;
    return [
      { x: g, y: g, w, h },
      { x: g + w + g, y: g, w, h },
      { x: g, y: g + h + g, w, h },
      { x: g + w + g, y: g + h + g, w, h },
    ];
  }
  // strip3: the classic poster — three stacked horizontal panels, the top
  // one a little taller, like the frames of a comic strip.
  const fractions = [0.36, 0.32, 0.32];
  const rows = [];
  let y = g;
  for (let i = 0; i < 3; i++) {
    const h = (innerH - 2 * g) * fractions[i];
    rows.push({ x: g, y, w: innerW, h });
    y += h + g;
  }
  return rows;
}

/**
 * Where an image of imgW x imgH lands inside a panel rect, given the
 * panel's zoom (1 = base size), pan offsets ox/oy as fractions of the
 * panel's width/height (so a crop survives an export-size change) and the
 * fit mode: 'fill' crops to cover the panel, 'fit' shows the whole photo.
 * Returns the destination rect for drawImage.
 */
export function coverTransform(imgW, imgH, rect, zoom, ox, oy, fit) {
  const base = fit === 'fit'
    ? Math.min(rect.w / imgW, rect.h / imgH)
    : Math.max(rect.w / imgW, rect.h / imgH);
  const dw = imgW * base * zoom;
  const dh = imgH * base * zoom;
  return {
    dx: rect.x + (rect.w - dw) / 2 + ox * rect.w,
    dy: rect.y + (rect.h - dh) / 2 + oy * rect.h,
    dw,
    dh,
  };
}

/** Clamp a zoom to the range the sliders and the wheel allow. */
export function clampZoom(zoom) {
  return Math.min(4, Math.max(0.5, zoom));
}

/**
 * Clamp a pan offset (a fraction of the panel) so the photo cannot be
 * dragged wholly out of view: at zoom 1 the photo may move a quarter of
 * the panel either way, and more as it is zoomed in.
 */
export function clampPan(offset, zoom) {
  const slack = (zoom - 1) / 2 + 0.25;
  return Math.min(slack, Math.max(-slack, offset));
}

/**
 * Shrink a caption until it fits maxWidth. measure(text, px) returns the
 * width of the text at that pixel size; start is the first size to try.
 */
export function fitCaptionSize(measure, text, maxWidth, start, min) {
  let size = start;
  while (size > min && measure(text, size) > maxWidth) {
    size = Math.max(min, size * 0.94);
  }
  return size;
}

/** Which panel, if any, contains the point (x, y) in cover pixels. */
export function panelAt(rects, x, y) {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
  }
  return -1;
}
