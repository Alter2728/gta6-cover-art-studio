// Wires Sunset Cover Studio: photo slots, layout and grade controls, the
// headline editor, canvas pan/zoom/nudge, shuffle, and PNG export.
// A `?scene=` query sets up a fixed scene for a screenshot instead (shots.mjs).

import { renderCover, coverStateDefaults, shuffleState, HEADLINE_PRESETS } from './cover.mjs';
import { GRADES, INKS, EXPORT_SIZES, exportSizeById, exportFileName } from './grades.mjs';
import { LAYOUTS, frameRects, frameAt, defaultCrops, nudgeCrop, zoomCrop } from './layouts.mjs';
import { runScene } from './shots.mjs';

const canvas = document.getElementById('cover');
const status = document.getElementById('status');
const state = coverStateDefaults();
let exportSize = EXPORT_SIZES[0];

window.__state = state;

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

/** Redraws the preview canvas at the current export aspect. */
export function redraw() {
  if (canvas.width !== exportSize.width || canvas.height !== exportSize.height) {
    canvas.width = exportSize.width;
    canvas.height = exportSize.height;
  }
  const ctx = canvas.getContext('2d');
  renderCover(ctx, state, canvas.width, canvas.height);
}

/** Renders the cover offscreen at w x h and returns a PNG data URL. */
export async function exportCoverPNG(width, height) {
  await document.fonts.load('100px Anton');
  await document.fonts.ready;
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  renderCover(off.getContext('2d'), state, width, height);
  return off.toDataURL('image/png');
}

window.__exportCoverPNG = exportCoverPNG;

/** Downloads the cover at the chosen size and records it for tests. */
async function exportCover(size) {
  const dataUrl = await exportCoverPNG(size.width, size.height);
  window.__lastExport = { id: size.id, width: size.width, height: size.height, dataUrl };
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = exportFileName(size);
  a.click();
  status.textContent = `Saved ${exportFileName(size)}`;
}

/** Marks the active button in a group (layout, grade, ink, size). */
function markActive(group, id) {
  document.querySelectorAll(`[data-group="${group}"]`).forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === id);
  });
}

/** Rebuilds the per-frame crops when the layout or photo count changes. */
function rebuildCrops() {
  const loaded = state.photos.filter(Boolean).length;
  state.crops = defaultCrops(state.layout, Math.max(1, loaded));
  state.selectedFrame = 0;
}

/** Applies a layout: new frames, fresh crops, redraw. */
function setLayout(id) {
  state.layout = LAYOUTS.some((l) => l.id === id) ? id : 'strip3';
  rebuildCrops();
  markActive('layout', state.layout);
  redraw();
}

/** Applies a grade and its slider position. */
function setGrade(id) {
  state.grade = GRADES.some((g) => g.id === id) ? id : 'vice';
  markActive('grade', state.grade);
  redraw();
}

function setInk(id) {
  state.ink = INKS.some((i) => i.id === id) ? id : 'white';
  markActive('ink', state.ink);
  redraw();
}

function setExportSize(id) {
  exportSize = exportSizeById(id);
  markActive('size', exportSize.id);
  redraw();
}

// --- Photo slots -----------------------------------------------------------
async function loadSlot(slot, fileOrUrl) {
  try {
    const img = typeof fileOrUrl === 'string'
      ? await loadImage(fileOrUrl)
      : await loadImage(URL.createObjectURL(fileOrUrl));
    state.photos[slot] = img;
    rebuildCrops();
    redraw();
    status.textContent = `Photo ${slot + 1} loaded.`;
  } catch {
    status.textContent = `Photo ${slot + 1} could not be loaded.`;
  }
}

[1, 2, 3].forEach((n) => {
  document.getElementById(`photo${n}`).addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadSlot(n - 1, file);
  });
});

document.getElementById('loadSamples').addEventListener('click', async () => {
  await loadSlot(0, 'samples/boulevard.jpg');
  await loadSlot(1, 'samples/pier.jpg');
});

// --- Layout / grade / ink buttons ------------------------------------------
document.querySelectorAll('[data-group="layout"]').forEach((btn) => {
  btn.addEventListener('click', () => setLayout(btn.dataset.value));
});
document.querySelectorAll('[data-group="grade"]').forEach((btn) => {
  btn.addEventListener('click', () => setGrade(btn.dataset.value));
});
document.querySelectorAll('[data-group="ink"]').forEach((btn) => {
  btn.addEventListener('click', () => setInk(btn.dataset.value));
});
document.querySelectorAll('[data-group="size"]').forEach((btn) => {
  btn.addEventListener('click', () => setExportSize(btn.dataset.value));
});

// --- Sliders and toggles ----------------------------------------------------
const intensity = document.getElementById('gradeIntensity');
intensity.addEventListener('input', () => {
  state.gradeIntensity = Number(intensity.value);
  document.getElementById('gradeIntensityValue').textContent = `${intensity.value}%`;
  redraw();
});
const glow = document.getElementById('neonGlow');
glow.addEventListener('input', () => {
  state.neonGlow = Number(glow.value);
  document.getElementById('neonGlowValue').textContent = `${glow.value}%`;
  redraw();
});
document.getElementById('vignette').addEventListener('change', (e) => {
  state.vignette = e.target.checked;
  redraw();
});
document.getElementById('grain').addEventListener('change', (e) => {
  state.grain = e.target.checked;
  redraw();
});

// --- Headline editor --------------------------------------------------------
const headlineInput = document.getElementById('headline');
headlineInput.addEventListener('input', () => {
  state.headline = headlineInput.value;
  redraw();
});
const taglineInput = document.getElementById('tagline');
taglineInput.addEventListener('input', () => {
  state.tagline = taglineInput.value;
  redraw();
});
document.querySelectorAll('[data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.headline = btn.dataset.preset;
    headlineInput.value = btn.dataset.preset;
    redraw();
  });
});
document.getElementById('shuffle').addEventListener('click', () => {
  const next = shuffleState(state);
  Object.assign(state, next);
  headlineInput.value = state.headline;
  taglineInput.value = state.tagline;
  intensity.value = String(state.gradeIntensity);
  glow.value = String(state.neonGlow);
  document.getElementById('gradeIntensityValue').textContent = `${state.gradeIntensity}%`;
  document.getElementById('neonGlowValue').textContent = `${state.neonGlow}%`;
  markActive('layout', state.layout);
  markActive('grade', state.grade);
  markActive('ink', state.ink);
  redraw();
  status.textContent = 'Shuffled the composition.';
});

// --- Export buttons ---------------------------------------------------------
document.querySelectorAll('[data-export]').forEach((btn) => {
  btn.addEventListener('click', () => exportCover(exportSizeById(btn.dataset.export)));
});

// --- Canvas: select a frame, drag to pan, wheel to zoom, arrows to nudge ---
function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * canvas.width,
    y: ((e.clientY - rect.top) / rect.height) * canvas.height,
  };
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  const p = canvasPoint(e);
  const frame = frameAt(state.layout, canvas.width, canvas.height, p.x, p.y);
  if (frame === -1) return;
  state.selectedFrame = frame;
  drag = { start: p, crop: { ...state.crops[frame] } };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = canvasPoint(e);
  const frame = frameRects(state.layout, canvas.width, canvas.height)[state.selectedFrame];
  const next = { ...drag.crop };
  next.panX += (p.x - drag.start.x) / frame.w;
  next.panY += (p.y - drag.start.y) / frame.h;
  state.crops[state.selectedFrame] = next;
  redraw();
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const frame = state.selectedFrame;
  state.crops[frame] = zoomCrop(state.crops[frame], e.deltaY < 0 ? 1.12 : 1 / 1.12);
  redraw();
}, { passive: false });
canvas.addEventListener('keydown', (e) => {
  const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  const dir = map[e.key];
  if (!dir) return;
  e.preventDefault();
  const frame = state.selectedFrame;
  state.crops[frame] = nudgeCrop(state.crops[frame], dir);
  redraw();
});

// --- Start ------------------------------------------------------------------
markActive('layout', state.layout);
markActive('grade', state.grade);
markActive('ink', state.ink);
markActive('size', exportSize.id);
rebuildCrops();

const scene = new URLSearchParams(location.search).get('scene');
if (scene) {
  runScene(scene, location.search, { state, loadImage, redraw });
} else {
  loadSlot(0, 'samples/boulevard.jpg');
  redraw();
}

export { state, HEADLINE_PRESETS };
