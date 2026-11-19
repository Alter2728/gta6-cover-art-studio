// The cover renderer: draws one finished cover onto a 2D canvas context at
// any pixel size, from the editor state. The same function paints the live
// preview and the exported PNG, so what you see is what you share.
//
// state shape:
//   layout, gradeId, frame (bool), title, subtitle, titlePct (title height
//   as % of cover height), captionPos ('top' | 'bottom'), captionPaint,
//   outline (bool), photos: [HTMLImageElement | null, ...],
//   panels: [{ photo, zoom, ox, oy, fit }, ...] — one per layout rect.
import { layoutPanels, coverTransform, fitCaptionSize, panelGap } from './layouts.mjs';
import { gradeById, CAPTION_PAINTS } from './grades.mjs';

const TITLE_FONT = 'Anton, "Arial Narrow", sans-serif';
const SUB_FONT = 'system-ui, sans-serif';

/** Paint one gradient overlay, given in panel-relative coordinates. */
function paintOverlay(ctx, rect, overlay) {
  const grad = ctx.createLinearGradient(
    rect.x + overlay.x0 * rect.w, rect.y + overlay.y0 * rect.h,
    rect.x + overlay.x1 * rect.w, rect.y + overlay.y1 * rect.h,
  );
  for (const [at, colour] of overlay.stops) grad.addColorStop(at, colour);
  ctx.fillStyle = grad;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

/** Draw the title + subtitle block, centred, at the top or bottom. */
function paintCaption(ctx, state, width, height) {
  const title = (state.title || '').trim().toUpperCase();
  const subtitle = (state.subtitle || '').trim().toUpperCase();
  if (!title && !subtitle) return;
  const bandH = height * (state.titlePct / 100) * 2.1 + height * 0.02;
  const atBottom = state.captionPos !== 'top';
  const bandY = atBottom ? height - bandH : 0;
  // A dark band behind the lettering keeps it readable over any photo.
  const band = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
  if (atBottom) {
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

  const maxW = width * 0.92;
  const cx = width / 2;
  if (title) {
    const startSize = height * (state.titlePct / 100);
    const measure = (text, px) => {
      ctx.font = `${px}px ${TITLE_FONT}`;
      return ctx.measureText(text).width;
    };
    const size = fitCaptionSize(measure, title, maxW, startSize, 14);
    const subSize = subtitle ? Math.max(12, size * 0.24) : 0;
    const gap = subtitle ? Math.max(8, size * 0.08) : 0;
    // Stack the two lines inside the band with a clear gap, so the tagline
    // never sits on top of the title.
    const margin = height * 0.03;
    const titleY = atBottom
      ? height - margin - subSize - gap - size / 2
      : bandY + margin + size / 2;
    const subY = atBottom
      ? height - margin - subSize / 2
      : bandY + margin + size + gap + subSize / 2;
    ctx.font = `${size}px ${TITLE_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const paint = CAPTION_PAINTS[state.captionPaint] ?? CAPTION_PAINTS.white;
    if (paint.gradient) {
      const grad = ctx.createLinearGradient(cx - maxW / 2, 0, cx + maxW / 2, 0);
      paint.gradient.forEach((c, i) => grad.addColorStop(i / (paint.gradient.length - 1), c));
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = paint.fill;
    }
    ctx.shadowColor = 'rgba(10,0,20,0.65)';
    ctx.shadowBlur = size * 0.14;
    ctx.shadowOffsetY = size * 0.04;
    if (state.outline) {
      ctx.lineWidth = Math.max(2, size * 0.09);
      ctx.strokeStyle = 'rgba(12,2,24,0.9)';
      ctx.lineJoin = 'round';
      ctx.strokeText(title, cx, titleY);
    }
    ctx.fillText(title, cx, titleY);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    if (subtitle) {
      ctx.font = `600 ${subSize}px ${SUB_FONT}`;
      try { ctx.letterSpacing = `${Math.max(2, subSize * 0.22)}px`; } catch { /* older canvas */ }
      ctx.fillStyle = '#ffe9f2';
      ctx.fillText(subtitle, cx, subY);
      try { ctx.letterSpacing = '0px'; } catch { /* older canvas */ }
    }
  } else if (subtitle) {
    ctx.font = `bold ${Math.max(14, height * 0.028)}px ${SUB_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe9f2';
    ctx.fillText(subtitle, cx, bandY + bandH / 2);
  }
}

/**
 * Draw the whole cover. `photos` are HTMLImageElements (or null for an
 * empty slot); `panels` holds one entry per rect of the current layout.
 * Safe to call on an offscreen canvas at export size.
 */
export function drawCover(ctx, state, width, height) {
  const grade = gradeById(state.gradeId);
  const rects = layoutPanels(state.layout, width, height);
  const gap = panelGap(width, height);

  ctx.save();
  ctx.fillStyle = '#160a20';
  ctx.fillRect(0, 0, width, height);

  rects.forEach((rect, i) => {
    const panel = state.panels[i] ?? { photo: 0, zoom: 1, ox: 0, oy: 0, fit: 'fill' };
    const photo = state.photos[panel.photo] ?? null;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    if (photo && photo.naturalWidth > 0) {
      const t = coverTransform(photo.naturalWidth, photo.naturalHeight, rect, panel.zoom, panel.ox, panel.oy, panel.fit);
      ctx.filter = grade.filter;
      ctx.drawImage(photo, t.dx, t.dy, t.dw, t.dh);
      ctx.filter = 'none';
      for (const overlay of grade.overlays) paintOverlay(ctx, rect, overlay);
    } else {
      // Empty panel: a sunset wash with a hint of what goes there.
      const wash = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
      wash.addColorStop(0, '#3a1445');
      wash.addColorStop(1, '#12081c');
      ctx.fillStyle = wash;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = `bold ${Math.max(13, rect.h * 0.06)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Drop a photo here', rect.x + rect.w / 2, rect.y + rect.h / 2);
    }
    ctx.restore();
    // Crisp white frame around each panel, poster style.
    ctx.lineWidth = Math.max(2, gap * 0.55);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  });

  // Soft vignette over the whole cover.
  const vig = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.35,
    width / 2, height / 2, Math.max(width, height) * 0.75,
  );
  vig.addColorStop(0, 'rgba(10,0,20,0)');
  vig.addColorStop(1, 'rgba(10,0,20,0.38)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  if (state.frame) {
    ctx.lineWidth = Math.max(3, Math.min(width, height) * 0.008);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(gap / 2, gap / 2, width - gap, height - gap);
  }

  paintCaption(ctx, state, width, height);
  ctx.restore();
}

/** Re-exported for the editor's hit-testing. */
export { layoutPanels, panelAt } from './layouts.mjs';
