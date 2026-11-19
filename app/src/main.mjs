// Wires Sunset Cover Studio: photos, controls, canvas gestures, export.
// Photos are read on the user's own machine and never uploaded. The state
// is one plain object; every change redraws the live preview canvas, and
// export draws the same state at the chosen post size.

import { drawCover } from './cover.mjs';
import { GRADES, INKS, EXPORT_SIZES, exportSizeById } from './grades.mjs';
import {
  LAYOUTS, layoutById, frameRects, frameAt, defaultCrops,
  nudgeCrop, zoomCrop, clampCrop, shufflePick,
} from './layouts.mjs';
import { runScene } from './shots.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('cover');
const statusEl = $('status');

/** The headline presets: a headline and the tagline that goes with it. */
export const PRESETS = {
  'VICE CITY': 'Welcome back to Vice City',
  'SUNSET DRIVE': 'Golden hour in Vice City',
  'NEON RIDE': 'Drive all night',
  'PIER PRESSURE': 'The city never sleeps',
};

const state = {
  layout: 'strip3',
  grade: 'vice',
  ink: 'white',
  intensity: 55,
  glow: 60,
  headline: 'VICE CITY',
  tagline: 'Welcome back to Vice City',
  grain: true,
  vignette: true,
  exportSize: EXPORT_SIZES[0],
  photos: [],
  crops: defaultCrops('strip3', 0),
  selected: 0,
};

let fontsReady = false;
try {
  document.fonts.load('100px Anton').then(() => {
    fontsReady = true;
    redraw();
  });
} catch {
  fontsReady = true;
}

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** The current drawing options for drawCover at a given canvas size. */
function drawOptions(w, h) {
  return {
    width: w,
    height: h,
    layoutId: state.layout,
    photos: state.photos,
    crops: state.crops,
    gradeId: state.grade,
    intensity: state.intensity,
    inkId: state.ink,
    headline: state.headline,
    tagline: state.tagline,
    glow: state.glow,
    grain: state.grain,
    vignette: state.vignette,
    seed: 7,
  };
}

/** Redraws the live preview at the current export size's aspect. */
export function redraw() {
  const { w, h } = state.exportSize;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  drawCover(ctx, drawOptions(w, h));
}

/** Marks the active button in a group that carries data-* values. */
function setActive(attr, value) {
  document.querySelectorAll(`[data-${attr}]`).forEach((el) => {
    el.classList.toggle('active', el.dataset[attr] === value);
  });
}

/** Refreshes every control to match the state, then redraws. */
function syncUI() {
  setActive('layout', state.layout);
  setActive('grade', state.grade);
  setActive('ink', state.ink);
  setActive('size', `${state.exportSize.w}x${state.exportSize.h}`);
  setActive('preset', state.headline);
  $('headline').value = state.headline;
  $('tagline').value = state.tagline;
  $('intensity').value = String(state.intensity);
  $('glow').value = String(state.glow);
  $('grain').checked = state.grain;
  $('vignette').checked = state.vignette;
  $('intensity-value').textContent = `${state.intensity}%`;
  $('glow-value').textContent = `${state.glow}%`;
  $('photo-count').textContent = `${state.photos.length} / 3 photos`;
  redraw();
}

/** Applies a fixed scene's parameters (from ?scene=) to the state. */
function applyScene(params) {
  state.layout = layoutById(params.layout).id;
  state.grade = GRADES[params.grade] ? params.grade : 'vice';
  state.ink = INKS[params.ink] ? params.ink : 'white';
  state.headline = params.headline;
  state.tagline = params.tagline;
  state.crops = defaultCrops(state.layout, Math.max(1, state.photos.length));
  syncUI();
}

/** Loads a bundled sample photo (pier or boulevard) as the first photo. */
async function loadSample(name) {
  const img = await loadImage(`./samples/${name}.jpg`);
  const photo = { image: img, width: img.naturalWidth, height: img.naturalHeight };
  state.photos = [photo];
  state.crops = defaultCrops(state.layout, 1);
  syncUI();
  return photo;
}

/** Adds user photos from files, up to 3 in total, read locally only. */
async function addPhotos(files) {
  const slots = 3 - state.photos.length;
  const picked = [...files].slice(0, Math.max(0, slots));
  for (const file of picked) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      state.photos.push({ image: img, width: img.naturalWidth, height: img.naturalHeight });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  state.crops = defaultCrops(state.layout, state.photos.length);
  state.selected = 0;
  syncUI();
  statusEl.textContent = `${state.photos.length} photo${state.photos.length === 1 ? '' : 's'} loaded — drag a panel to pan, scroll to zoom.`;
}

/** Exports the cover at w × h as a PNG data URL (also used by the tests). */
export async function exportPng(w, h) {
  if (!fontsReady) {
    try {
      await document.fonts.load('100px Anton');
      fontsReady = true;
    } catch {
      // Fall through and draw with whatever font is available.
    }
  }
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  drawCover(off.getContext('2d'), drawOptions(w, h));
  return off.toDataURL('image/png');
}

/** Downloads the cover at w × h as sunset-cover-<WxH>.png. */
async function downloadExport(w, h) {
  const url = await exportPng(w, h);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sunset-cover-${w}x${h}.png`;
  a.click();
  statusEl.textContent = `Saved sunset-cover-${w}x${h}.png`;
}

/** Picks a random layout, grade, ink and crops, then redraws. */
function shuffle() {
  const picked = shufflePick(Math.random);
  state.layout = picked.layout;
  state.grade = picked.grade;
  state.ink = picked.ink;
  const frames = frameRects(state.layout, state.exportSize.w, state.exportSize.h);
  state.crops = picked.crops.slice(0, frames.length).map((crop, i) => {
    const photo = state.photos[crop.photoIndex % Math.max(1, state.photos.length)] ?? null;
    const base = { ...crop, photoIndex: state.photos.length ? crop.photoIndex % state.photos.length : 0 };
    if (!photo) return { ...base, zoom: 1, ox: 0, oy: 0 };
    return clampCrop(base, photo.width, photo.height, frames[i]);
  });
  syncUI();
  statusEl.textContent = `Shuffled: ${LAYOUTS[state.layout].name} · ${GRADES[state.grade].name} · ${INKS[state.ink].name}.`;
}

// ---- controls ----------------------------------------------------------

document.querySelectorAll('[data-layout]').forEach((el) => {
  el.addEventListener('click', () => {
    state.layout = el.dataset.layout;
    state.crops = defaultCrops(state.layout, state.photos.length);
    state.selected = 0;
    syncUI();
  });
});
document.querySelectorAll('[data-grade]').forEach((el) => {
  el.addEventListener('click', () => {
    state.grade = el.dataset.grade;
    syncUI();
  });
});
document.querySelectorAll('[data-ink]').forEach((el) => {
  el.addEventListener('click', () => {
    state.ink = el.dataset.ink;
    syncUI();
  });
});
document.querySelectorAll('[data-size]').forEach((el) => {
  el.addEventListener('click', () => {
    state.exportSize = exportSizeById(el.dataset.size);
    syncUI();
  });
});
document.querySelectorAll('[data-preset]').forEach((el) => {
  el.addEventListener('click', () => {
    state.headline = el.dataset.preset;
    state.tagline = PRESETS[el.dataset.preset] ?? state.tagline;
    syncUI();
  });
});
document.querySelectorAll('[data-export]').forEach((el) => {
  el.addEventListener('click', () => {
    const size = exportSizeById(el.dataset.export);
    downloadExport(size.w, size.h);
  });
});
$('headline').addEventListener('input', (e) => {
  state.headline = e.target.value;
  setActive('preset', state.headline);
  redraw();
});
$('tagline').addEventListener('input', (e) => {
  state.tagline = e.target.value;
  redraw();
});
$('intensity').addEventListener('input', (e) => {
  state.intensity = Number(e.target.value);
  $('intensity-value').textContent = `${state.intensity}%`;
  redraw();
});
$('glow').addEventListener('input', (e) => {
  state.glow = Number(e.target.value);
  $('glow-value').textContent = `${state.glow}%`;
  redraw();
});
$('grain').addEventListener('change', (e) => {
  state.grain = e.target.checked;
  redraw();
});
$('vignette').addEventListener('change', (e) => {
  state.vignette = e.target.checked;
  redraw();
});
$('photos').addEventListener('change', (e) => addPhotos(e.target.files));
$('shuffle').addEventListener('click', shuffle);

// ---- canvas gestures: drag to pan, scroll to zoom, arrows to nudge -----

let drag = null;

function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * canvas.width,
    y: ((e.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function selectedPhotoAndFrame() {
  const frames = frameRects(state.layout, canvas.width, canvas.height);
  const frame = frames[state.selected];
  const crop = state.crops[state.selected];
  const photo = crop ? state.photos[crop.photoIndex] : null;
  return { frame, crop, photo };
}

canvas.addEventListener('pointerdown', (e) => {
  const p = canvasPoint(e);
  const hit = frameAt(state.layout, canvas.width, canvas.height, p.x, p.y);
  if (hit < 0) return;
  state.selected = hit;
  drag = { x: p.x, y: p.y };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = canvasPoint(e);
  const { frame, crop, photo } = selectedPhotoAndFrame();
  if (!frame || !crop || !photo) return;
  const next = nudgeCrop(crop, photo.width, photo.height, frame, (p.x - drag.x) / frame.w, (p.y - drag.y) / frame.h);
  state.crops[state.selected] = next;
  drag = { x: p.x, y: p.y };
  redraw();
});
canvas.addEventListener('pointerup', () => {
  drag = null;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const { frame, crop, photo } = selectedPhotoAndFrame();
  if (!frame || !crop || !photo) return;
  state.crops[state.selected] = zoomCrop(crop, photo.width, photo.height, frame, e.deltaY < 0 ? 1.1 : 0.9);
  redraw();
}, { passive: false });
canvas.addEventListener('keydown', (e) => {
  const step = 0.02;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const move = moves[e.key];
  if (!move) return;
  e.preventDefault();
  const { frame, crop, photo } = selectedPhotoAndFrame();
  if (!frame || !crop || !photo) return;
  state.crops[state.selected] = nudgeCrop(crop, photo.width, photo.height, frame, move[0], move[1]);
  redraw();
});

// ---- boot ---------------------------------------------------------------

window.__sunset = { state, redraw, exportPng, shuffle, loadSample, applyScene };

const query = new URLSearchParams(location.search);
if (query.get('scene')) {
  loadSample('pier')
    .then(() => runScene(query.get('scene'), query, { applyScene, loadSample, redraw }))
    .catch(() => {
      redraw();
      window.__shotReady = true;
    });
} else {
  loadSample('pier').catch(() => redraw());
}
