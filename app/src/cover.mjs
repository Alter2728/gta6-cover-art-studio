// The cover renderer (round 2): paints one finished cover onto a 2D canvas
// context at any pixel size, from the editor's poster state. The same
// function paints the live preview and the exported PNG, so what you see is
// what you share.
//
// poster shape:
//   arrangement, tint, tintStrength (0..1), glow (0..1), grain (bool),
//   vignette (bool), outerFrame (bool), headline, tagline,
//   headlineScale (headline height as % of cover height),
//   headlineSide ('bottom' | 'top'), ink, inkOutline (bool),
//   pictures: [HTMLImageElement | null, ...],
//   frames: [{ picture, zoom, dx, dy, mode }, ...] — one per layout rect.
import { rectsFor, placePhoto, gapFor, shrinkCaption } from './layouts.mjs';
import { gradeLookup, gradeFilter, tintAlpha, TITLE_INKS, inkLookup } from './grades.mjs';

const HEADLINE_FONT = 'Anton, "Arial Narrow", sans-serif';
const TAGLINE_FONT = 'system-ui, sans-serif';

// The three export sizes the bounty asks for.
export const EXPORT_PRESETS = [
  { id: 'square', label: '1080 × 1080', w: 1080, h: 1080 },
  { id: 'portrait', label: '1080 × 1350', w: 1080, h: 1350 },
  { id: 'wide', label: '1920 × 1080', w: 1920, h: 1080 },
];

// A tiny deterministic random stream, so the film grain looks the same in
// the preview and in every export.
function seededStream(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One gradient tint layer, painted over a frame rectangle.
function washFrame(ctx, frame, layer, strength) {
  const alpha = tintAlpha(layer, strength);
  if (alpha <= 0.01) return;
  const grad = ctx.createLinearGradient(
    frame.x + layer.x0 * frame.w, frame.y + layer.y0 * frame.h,
    frame.x + layer.x1 * frame.w, frame.y + layer.y1 * frame.h,
  );
  for (const [at, colour] of layer.stops) grad.addColorStop(at, colour);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = grad;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  ctx.globalAlpha = 1;
}

// Paint one photo frame: the photo (graded + tinted), or a sunset wash
// with a hint when the frame is still empty.
function drawPhotoFrame(ctx, poster, frame, index, width, height) {
  const slot = poster.frames[index] ?? { picture: 0, zoom: 1, dx: 0, dy: 0, mode: 'cover' };
  const photo = poster.pictures[slot.picture] ?? null;
  const grade = gradeLookup(poster.tint);

  ctx.save();
  ctx.beginPath();
  ctx.rect(frame.x, frame.y, frame.w, frame.h);
  ctx.clip();

  if (photo && photo.naturalWidth > 0) {
    const dest = placePhoto(
      photo.naturalWidth, photo.naturalHeight, frame,
      slot.zoom, slot.dx, slot.dy, slot.mode,
    );
    ctx.filter = gradeFilter(grade, poster.tintStrength ?? 1);
    ctx.drawImage(photo, dest.x, dest.y, dest.w, dest.h);
    ctx.filter = 'none';
    for (const layer of grade.tints) washFrame(ctx, frame, layer, poster.tintStrength ?? 1);
  } else {
    const wash = ctx.createLinearGradient(frame.x, frame.y, frame.x, frame.y + frame.h);
    wash.addColorStop(0, '#3d1547');
    wash.addColorStop(0.55, '#a52a5e');
    wash.addColorStop(1, '#12081c');
    ctx.fillStyle = wash;
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `bold ${Math.max(13, frame.h * 0.055)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Drop a photo here', frame.x + frame.w / 2, frame.y + frame.h / 2);
  }
  ctx.restore();

  // A crisp white edge around each frame, poster style.
  const gap = gapFor(width, height);
  ctx.lineWidth = Math.max(2, gap * 0.55);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);
}

// A warm sun glow behind the headline band, so the lettering sits on light.
function drawSunGlow(ctx, bandY, bandH, width, height) {
  const cx = width / 2;
  const cy = bandY + bandH / 2;
  const radius = Math.max(width, height) * 0.42;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  glow.addColorStop(0, 'rgba(255,166,66,0.5)');
  glow.addColorStop(0.5, 'rgba(255,94,122,0.22)');
  glow.addColorStop(1, 'rgba(255,94,122,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}

// A neon rule — a bright gradient bar with a soft halo — just above or
// below the headline, its strength set by the editor's glow slider.
function drawNeonRule(ctx, y, width, strength) {
  if (strength <= 0.02) return;
  const barH = Math.max(3, width * 0.004);
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, '#ff2ea6');
  grad.addColorStop(0.5, '#ffd76a');
  grad.addColorStop(1, '#21d8ff');
  ctx.save();
  ctx.shadowColor = '#ff2ea6';
  ctx.shadowBlur = barH * 6 * strength;
  ctx.globalAlpha = 0.35 + 0.65 * strength;
  ctx.fillStyle = grad;
  ctx.fillRect(width * 0.08, y - barH / 2, width * 0.84, barH);
  ctx.restore();
}

// The headline + tagline block, centred, at the top or the bottom.
function drawTitleBlock(ctx, poster, width, height) {
  const headline = (poster.headline || '').trim().toUpperCase();
  const tagline = (poster.tagline || '').trim().toUpperCase();
  if (!headline && !tagline) return;

  const onBottom = poster.headlineSide !== 'top';
  const bandH = height * (poster.headlineScale / 100) * 2.1 + height * 0.02;
  const bandY = onBottom ? height - bandH : 0;

  // A dark band keeps the lettering readable over any photo.
  const band = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
  if (onBottom) {
    band.addColorStop(0, 'rgba(16,4,28,0)');
    band.addColorStop(0.45, 'rgba(16,4,28,0.72)');
    band.addColorStop(1, 'rgba(16,4,28,0.88)');
  } else {
    band.addColorStop(0, 'rgba(16,4,28,0.88)');
    band.addColorStop(0.55, 'rgba(16,4,28,0.72)');
    band.addColorStop(1, 'rgba(16,4,28,0)');
  }
  ctx.fillStyle = band;
  ctx.fillRect(0, bandY, width, bandH);
  drawSunGlow(ctx, bandY, bandH, width, height);

  const maxW = width * 0.92;
  const cx = width / 2;
  const margin = height * 0.03;

  if (headline) {
    const startSize = height * (poster.headlineScale / 100);
    const size = shrinkCaption(
      (text, px) => { ctx.font = `${px}px ${HEADLINE_FONT}`; return ctx.measureText(text).width; },
      headline, maxW, startSize, 14,
    );
    const subSize = tagline ? Math.max(12, size * 0.24) : 0;
    const gap = tagline ? Math.max(8, size * 0.08) : 0;
    const titleY = onBottom
      ? height - margin - subSize - gap - size / 2
      : bandY + margin + size / 2;
    const subY = onBottom
      ? height - margin - subSize / 2
      : bandY + margin + size + gap + subSize / 2;

    // The neon rule sits on the side the block faces away from: above the
    // headline when the block is at the bottom, below the tagline when it
    // is at the top, so it never crosses any lettering.
    const ruleY = onBottom
      ? titleY - size * 0.72
      : (tagline ? subY + subSize * 0.7 : titleY + size * 0.72);
    drawNeonRule(ctx, ruleY, width, poster.glow ?? 0.6);

    ctx.font = `${size}px ${HEADLINE_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ink = inkLookup(poster.ink);
    if (ink.gradient) {
      const grad = ctx.createLinearGradient(cx - maxW / 2, 0, cx + maxW / 2, 0);
      ink.gradient.forEach((colour, i) => grad.addColorStop(i / (ink.gradient.length - 1), colour));
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = ink.fill;
    }
    const glow = poster.glow ?? 0.6;
    ctx.shadowColor = 'rgba(255,46,166,0.55)';
    ctx.shadowBlur = size * 0.16 * glow;
    ctx.shadowOffsetY = size * 0.04;
    if (poster.inkOutline) {
      ctx.lineWidth = Math.max(2, size * 0.09);
      ctx.strokeStyle = 'rgba(12,2,24,0.9)';
      ctx.lineJoin = 'round';
      ctx.strokeText(headline, cx, titleY);
    }
    ctx.fillText(headline, cx, titleY);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    if (tagline) {
      ctx.font = `600 ${subSize}px ${TAGLINE_FONT}`;
      try { ctx.letterSpacing = `${Math.max(2, subSize * 0.22)}px`; } catch { /* older canvas */ }
      ctx.fillStyle = '#ffe9f2';
      ctx.fillText(tagline, cx, subY);
      try { ctx.letterSpacing = '0px'; } catch { /* older canvas */ }
    }
  } else if (tagline) {
    ctx.font = `bold ${Math.max(14, height * 0.028)}px ${TAGLINE_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe9f2';
    ctx.fillText(tagline, cx, bandY + bandH / 2);
  }
}

// Soft darkening toward the corners, poster style.
function drawVignette(ctx, width, height) {
  const vig = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.35,
    width / 2, height / 2, Math.max(width, height) * 0.75,
  );
  vig.addColorStop(0, 'rgba(10,0,20,0)');
  vig.addColorStop(1, 'rgba(10,0,20,0.38)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);
}

// Film grain: a scatter of faint light and dark specks. Seeded, so the
// preview and the export match speck for speck.
function drawGrainSpecks(ctx, width, height) {
  const rand = seededStream(20261119);
  const count = Math.floor((width * height) / 900);
  ctx.save();
  for (let i = 0; i < count; i += 1) {
    const x = rand() * width;
    const y = rand() * height;
    const light = rand() > 0.5;
    ctx.fillStyle = light ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.restore();
}

// Draw the whole cover. Safe to call on an offscreen canvas at export size.
export function renderPoster(ctx, poster, width, height) {
  const frames = rectsFor(poster.arrangement, width, height);
  const gap = gapFor(width, height);

  ctx.save();
  ctx.fillStyle = '#160a20';
  ctx.fillRect(0, 0, width, height);

  frames.forEach((frame, i) => drawPhotoFrame(ctx, poster, frame, i, width, height));

  if (poster.vignette !== false) drawVignette(ctx, width, height);
  if (poster.grain) drawGrainSpecks(ctx, width, height);

  if (poster.outerFrame) {
    ctx.lineWidth = Math.max(3, Math.min(width, height) * 0.008);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(gap / 2, gap / 2, width - gap, height - gap);
  }

  drawTitleBlock(ctx, poster, width, height);
  ctx.restore();
}

// Re-exported for the editor's hit-testing.
export { rectsFor, hitPanel } from './layouts.mjs';
