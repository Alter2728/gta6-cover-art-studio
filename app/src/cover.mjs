// The cover renderer for Sunset Cover Studio: draws the whole cover onto
// a canvas 2D context — photos in their frames, the colour-grade wash, the
// sun glow, the neon rules, the headline in Anton, seeded film grain and
// the vignette — so the preview and the exported PNG are the same drawing.

import { gradeById, inkById, gradeAlpha } from './grades.mjs';
import { frameRects, placePhoto } from './layouts.mjs';

/** A deterministic PRNG (mulberry32): the same seed draws the same grain. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A #rrggbb colour as an rgba() string with the given alpha. */
export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * The headline size that fits `text` inside `maxWidth`, starting from
 * `startSize` and shrinking until it fits (never below 10 px).
 */
export function fitHeadlineSize(ctx, text, maxWidth, startSize) {
  let size = startSize;
  ctx.font = `${size}px Anton, sans-serif`;
  while (size > 10 && ctx.measureText(text).width > maxWidth) {
    size = Math.max(10, size * 0.92);
    ctx.font = `${size}px Anton, sans-serif`;
  }
  return size;
}

/** Draws one photo into its frame, or a dark fill when there is no photo. */
function drawPanel(ctx, photo, frame, crop) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(frame.x, frame.y, frame.w, frame.h);
  ctx.clip();
  if (photo) {
    const p = placePhoto(photo.width, photo.height, frame, crop);
    ctx.drawImage(photo.image, p.dx, p.dy, p.dw, p.dh);
  } else {
    ctx.fillStyle = '#1a0f24';
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  }
  ctx.restore();
}

/** The colour-grade wash over one frame, blended at the chosen intensity. */
function drawGradeWash(ctx, grade, intensity, frame) {
  const alpha = gradeAlpha(grade, intensity);
  if (alpha <= 0) return;
  const grad = ctx.createLinearGradient(frame.x, frame.y, frame.x + frame.w, frame.y + frame.h);
  for (const [stop, color] of grade.stops) grad.addColorStop(stop, color);
  ctx.save();
  ctx.globalCompositeOperation = grade.mode;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = grad;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  ctx.restore();
}

/** The sun glow behind the headline band, in the grade's middle colour. */
function drawSunGlow(ctx, grade, w, h) {
  const cx = w / 2;
  const cy = h * 0.74;
  const r = w * 0.5;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  glow.addColorStop(0, hexToRgba(grade.stops[1][1], 0.55));
  glow.addColorStop(0.6, hexToRgba(grade.stops[1][1], 0.18));
  glow.addColorStop(1, hexToRgba(grade.stops[1][1], 0));
  ctx.save();
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** One neon rule: a magenta–gold–cyan line with a halo set by the glow. */
function drawNeonRule(ctx, y, w, h, glow) {
  const grad = ctx.createLinearGradient(w * 0.08, 0, w * 0.92, 0);
  grad.addColorStop(0, '#ff2e88');
  grad.addColorStop(0.5, '#ffc53d');
  grad.addColorStop(1, '#00e5ff');
  ctx.save();
  ctx.strokeStyle = grad;
  ctx.lineWidth = Math.max(2, h * 0.004);
  ctx.shadowColor = '#ff2e88';
  ctx.shadowBlur = (glow / 100) * h * 0.02;
  ctx.beginPath();
  ctx.moveTo(w * 0.08, y);
  ctx.lineTo(w * 0.92, y);
  ctx.stroke();
  ctx.restore();
}

/** Deterministic film grain: seeded specks, identical at any canvas size. */
function drawGrain(ctx, w, h, seed) {
  const rng = mulberry32(seed);
  const count = Math.floor((w * h) / 1500);
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const s = 1 + rng() * 1.5;
    const alpha = 0.04 + rng() * 0.08;
    ctx.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    ctx.fillRect(x, y, s, s);
  }
}

/** A dark vignette that pulls the eye to the middle of the cover. */
function drawVignette(ctx, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.max(w, h) * 0.75;
  const grad = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.45, cx, cy, r);
  grad.addColorStop(0, 'rgba(10,0,20,0)');
  grad.addColorStop(1, 'rgba(10,0,20,0.38)');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Draws the whole cover onto `ctx` at the canvas's own size.
 * opts: { width, height, layoutId, photos, crops, gradeId, intensity,
 *   inkId, headline, tagline, glow, grain, vignette, seed }.
 * photos are { image, width, height }; crops are per-panel crops.
 */
export function drawCover(ctx, opts) {
  const w = opts.width;
  const h = opts.height;
  const grade = gradeById(opts.gradeId);
  const ink = inkById(opts.inkId);
  const frames = frameRects(opts.layoutId, w, h);

  ctx.save();
  ctx.fillStyle = grade.sky;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  frames.forEach((frame, i) => {
    const crop = opts.crops[i] ?? { photoIndex: 0, zoom: 1, ox: 0, oy: 0 };
    const photo = opts.photos[crop.photoIndex] ?? null;
    drawPanel(ctx, photo, frame, crop);
    drawGradeWash(ctx, grade, opts.intensity ?? 50, frame);
  });

  drawSunGlow(ctx, grade, w, h);

  const headline = (opts.headline ?? '').trim().toUpperCase();
  const headlineY = h * 0.84;
  if (headline) {
    const size = fitHeadlineSize(ctx, headline, w * 0.92, h * 0.11);
    ctx.save();
    ctx.font = `${size}px Anton, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ink.color;
    ctx.shadowColor = ink.shadow;
    ctx.shadowBlur = size * 0.15;
    ctx.fillText(headline, w / 2, headlineY);
    ctx.restore();
    drawNeonRule(ctx, headlineY - size * 1.05, w, h, opts.glow ?? 60);
    drawNeonRule(ctx, headlineY + size * 0.35, w, h, opts.glow ?? 60);
    const tagline = (opts.tagline ?? '').trim();
    if (tagline) {
      const tagSize = Math.max(12, size * 0.26);
      ctx.save();
      ctx.font = `${tagSize}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(20,0,30,0.6)';
      ctx.shadowBlur = tagSize * 0.2;
      ctx.fillText(tagline.toUpperCase(), w / 2, headlineY + size * 0.75);
      ctx.restore();
    }
  }

  if (opts.grain !== false) drawGrain(ctx, w, h, opts.seed ?? 7);
  if (opts.vignette !== false) drawVignette(ctx, w, h);

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.restore();
}
