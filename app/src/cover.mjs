// The cover renderer for Sunset Cover Studio: draws the whole poster onto any
// 2D canvas context — the on-screen preview and the exported PNG use this one
// function, so what you see is exactly what you get.
//
// Layers, bottom to top: sky background, photo frames, colour-grade wash,
// sun glow behind the headline, neon rules, headline + tagline, film grain,
// vignette. Grain is seeded, so a preview and an export of the same state
// are pixel-identical.

import { frameRects, placePhoto } from './layouts.mjs';
import { gradeById, gradeWash, inkById } from './grades.mjs';

/** The four headline presets on the buttons. */
export const HEADLINE_PRESETS = ['VICE CITY', 'SUNSET DRIVE', 'NEON RIDE', 'PIER PRESSURE'];

/** A small deterministic PRNG (mulberry32) so grain never flickers. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Default cover state: strip layout, Vice Sunset, empty photo slots. */
export function coverStateDefaults() {
  return {
    layout: 'strip3',
    grade: 'vice',
    gradeIntensity: 80,
    neonGlow: 70,
    vignette: true,
    grain: true,
    headline: 'VICE CITY',
    tagline: 'Welcome back to Vice City',
    ink: 'white',
    photos: [null, null, null],
    crops: [],
    seed: 7,
    selectedFrame: 0,
  };
}

/**
 * Fits headline text to a width: starts at maxSize and shrinks until the
 * text fits or it hits minSize. Returns the size that fits.
 */
export function fitHeadline(ctx, text, maxWidth, maxSize, minSize = 12) {
  let size = maxSize;
  const setFont = (s) => {
    ctx.font = `${s}px Anton, 'Arial Narrow', sans-serif`;
  };
  setFont(size);
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size = Math.max(minSize, Math.floor(size * 0.94));
    setFont(size);
  }
  return size;
}

/** Draws one horizontal neon rule: a magenta-gold-cyan line with a halo. */
export function drawNeonRule(ctx, width, y, thickness, glow) {
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, '#ff2e88');
  grad.addColorStop(0.5, '#ffc53d');
  grad.addColorStop(1, '#00e5ff');
  const halo = Math.max(0, Math.min(100, glow)) / 100;
  ctx.save();
  ctx.strokeStyle = grad;
  ctx.lineCap = 'round';
  // Wide soft halo first, then the bright core line.
  ctx.globalAlpha = 0.35 * halo;
  ctx.shadowColor = '#ff2e88';
  ctx.shadowBlur = thickness * 6 * halo;
  ctx.lineWidth = thickness * 3;
  ctx.beginPath();
  ctx.moveTo(width * 0.08, y);
  ctx.lineTo(width * 0.92, y);
  ctx.stroke();
  ctx.globalAlpha = 0.95;
  ctx.shadowBlur = thickness * 2 * halo;
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.moveTo(width * 0.08, y);
  ctx.lineTo(width * 0.92, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Deterministic film grain: a scatter of tiny black/white specks from a
 * seeded PRNG. Same seed and size always draw the same specks.
 */
export function drawGrain(ctx, width, height, seed) {
  const rng = mulberry32(seed);
  const count = Math.min(6000, Math.floor((width * height) / 400));
  const dot = width > 1400 ? 2 : 1;
  ctx.save();
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(rng() * width);
    const y = Math.floor(rng() * height);
    const light = rng() > 0.5;
    ctx.globalAlpha = 0.04 + rng() * 0.05;
    ctx.fillStyle = light ? '#ffffff' : '#000000';
    ctx.fillRect(x, y, dot, dot);
  }
  ctx.restore();
}

/** Fills a frame that has no photo yet with a dusk placeholder. */
function drawPlaceholder(ctx, frame, sky) {
  const grad = ctx.createLinearGradient(frame.x, frame.y, frame.x, frame.y + frame.h);
  grad.addColorStop(0, sky);
  grad.addColorStop(1, '#12081f');
  ctx.fillStyle = grad;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  // A faint sun disc so the empty frame still reads as a sunset.
  const sun = ctx.createRadialGradient(
    frame.x + frame.w / 2, frame.y + frame.h * 0.62, 4,
    frame.x + frame.w / 2, frame.y + frame.h * 0.62, frame.h * 0.4,
  );
  sun.addColorStop(0, 'rgba(255, 190, 90, 0.5)');
  sun.addColorStop(1, 'rgba(255, 190, 90, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
}

/**
 * Draws the whole cover onto ctx at width x height.
 * `state` is the object coverStateDefaults() returns, with photos filled in.
 */
export function renderCover(ctx, state, width, height) {
  const grade = gradeById(state.grade);
  const wash = gradeWash(grade, state.gradeIntensity);
  const ink = inkById(state.ink);
  const frames = frameRects(state.layout, width, height);

  // 1. Sky background (shows through the gaps between frames).
  ctx.fillStyle = wash.sky;
  ctx.fillRect(0, 0, width, height);

  // 2. Photo frames.
  frames.forEach((frame, i) => {
    const crop = state.crops[i] ?? { photo: 0, zoom: 1, panX: 0, panY: 0 };
    const photo = state.photos[crop.photo] ?? null;
    ctx.save();
    ctx.beginPath();
    ctx.rect(frame.x, frame.y, frame.w, frame.h);
    ctx.clip();
    if (photo) {
      const placed = placePhoto(photo.naturalWidth, photo.naturalHeight, frame, crop);
      ctx.drawImage(photo, placed.dx, placed.dy, placed.dw, placed.dh);
    } else {
      drawPlaceholder(ctx, frame, wash.sky);
    }
    ctx.restore();
  });

  // 3. Colour-grade wash over the whole poster.
  if (wash.alpha > 0) {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    wash.stops.forEach(([at, color]) => grad.addColorStop(at, color));
    ctx.save();
    ctx.globalCompositeOperation = wash.mode;
    ctx.globalAlpha = wash.alpha;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // 4. Sun glow behind the headline band.
  const glowY = height * 0.86;
  const glowR = width * 0.42;
  const sun = ctx.createRadialGradient(width / 2, glowY, 4, width / 2, glowY, glowR);
  sun.addColorStop(0, 'rgba(255, 196, 90, 0.55)');
  sun.addColorStop(0.55, 'rgba(255, 110, 80, 0.22)');
  sun.addColorStop(1, 'rgba(255, 110, 80, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // 5. Headline + tagline, auto-fit in Anton.
  const headline = (state.headline || '').trim().toUpperCase();
  const tagline = (state.tagline || '').trim();
  const bandTop = height * 0.76;
  const ruleY1 = bandTop + height * 0.015;
  const ruleY2 = height * 0.965;
  const thickness = Math.max(2, Math.round(height * 0.004));
  drawNeonRule(ctx, width, ruleY1, thickness, state.neonGlow);
  drawNeonRule(ctx, width, ruleY2, thickness, state.neonGlow);

  if (headline) {
    const maxSize = Math.round(height * 0.115);
    const size = fitHeadline(ctx, headline, width * 0.9, maxSize);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ink.color;
    ctx.shadowColor = ink.shadow;
    ctx.shadowBlur = size * 0.18;
    ctx.shadowOffsetY = size * 0.05;
    try {
      ctx.letterSpacing = `${Math.round(size * 0.02)}px`;
    } catch {
      // letterSpacing is Chrome-only; harmless to skip elsewhere.
    }
    ctx.fillText(headline, width / 2, height * 0.895);
    ctx.restore();
  }
  if (tagline) {
    const tagSize = Math.max(12, Math.round(height * 0.028));
    ctx.save();
    ctx.font = `600 ${tagSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = tagSize * 0.3;
    ctx.fillText(tagline, width / 2, height * 0.945);
    ctx.restore();
  }

  // 6. Film grain, seeded so preview and export match.
  if (state.grain) drawGrain(ctx, width, height, state.seed);

  // 7. Vignette.
  if (state.vignette) {
    const vig = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.42,
      width / 2, height / 2, Math.max(width, height) * 0.75,
    );
    vig.addColorStop(0, 'rgba(10, 0, 20, 0)');
    vig.addColorStop(1, 'rgba(10, 0, 20, 0.45)');
    ctx.save();
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

/**
 * "Shuffle the composition": a new random layout, grade, ink and per-frame
 * crop, from the rng given (pass a seeded one for a reproducible shuffle).
 */
export function shuffleState(state, rng = Math.random) {
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const next = { ...state };
  next.layout = pick(['strip3', 'full', 'split2', 'grid4']);
  next.grade = pick(['vice', 'pastel', 'neon', 'gold']);
  next.ink = pick(['white', 'gold', 'neon', 'ink']);
  next.gradeIntensity = 55 + Math.floor(rng() * 45);
  next.neonGlow = 40 + Math.floor(rng() * 60);
  const frames = frameRects(next.layout, 1000, 1000).length;
  next.crops = [];
  for (let i = 0; i < frames; i += 1) {
    next.crops.push({
      photo: state.photos.filter(Boolean).length > 0
        ? Math.floor(rng() * state.photos.filter(Boolean).length)
        : 0,
      zoom: 1 + rng() * 0.6,
      panX: (rng() - 0.5) * 0.3,
      panY: (rng() - 0.5) * 0.3,
    });
  }
  next.selectedFrame = 0;
  return next;
}
