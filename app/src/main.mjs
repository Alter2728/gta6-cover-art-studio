// Sunset Cover Studio — the editor wiring: photos, panels, caption, grades,
// export. The render engine lives in cover.mjs; this file only moves state
// around and calls drawCover for the preview and for exports.
import { drawCover, layoutPanels, panelAt } from './cover.mjs';
import { LAYOUTS, LAYOUT_LABELS, clampZoom, clampPan } from './layouts.mjs';
import { GRADES, CAPTION_PAINTS, CAPTION_PAINT_IDS } from './grades.mjs';
import { runShot } from './shots.mjs';

export const EXPORT_SIZES = [
  { id: 'square', label: '1080 × 1080', w: 1080, h: 1080 },
  { id: 'portrait', label: '1080 × 1350', w: 1080, h: 1350 },
  { id: 'wide', label: '1920 × 1080', w: 1920, h: 1080 },
];

const MAX_PHOTOS = 3;
const SAMPLES = { pier: 'samples/pier.jpg', boulevard: 'samples/boulevard.jpg' };

const canvas = document.getElementById('preview');
const statusEl = document.getElementById('status');
const ctx = canvas.getContext('2d');

const state = {
  layout: 'strip3',
  gradeId: 'sunset',
  frame: true,
  title: 'Sunset Heist',
  subtitle: 'A Vice City Story',
  titlePct: 11,
  captionPos: 'bottom',
  captionPaint: 'sunset',
  outline: true,
  exportSize: EXPORT_SIZES[2],
  photos: [], // { img, name, kind }
  panels: [], // { photo, zoom, ox, oy, fit }
};
let selectedPanel = 0;

/** A fresh panel: each panel index starts on a different crop of its photo,
// so one photo across three panels reads as three different frames. */
const STAGGER = [
  { zoom: 1, ox: 0, oy: 0 },
  { zoom: 1.4, ox: -0.09, oy: 0.06 },
  { zoom: 1.25, ox: 0.07, oy: -0.05 },
  { zoom: 1.5, ox: -0.05, oy: -0.04 },
];
function freshPanel(photo = 0, index = 0) {
  const s = STAGGER[index % STAGGER.length];
  return { photo, zoom: s.zoom, ox: s.ox, oy: s.oy, fit: 'fill' };
}

/** Keep one panel entry per rect of the current layout, keeping edits. */
function ensurePanels() {
  const count = layoutPanels(state.layout, 100, 100).length;
  while (state.panels.length < count) state.panels.push(freshPanel(0, state.panels.length));
  state.panels.length = count;
  selectedPanel = Math.min(selectedPanel, count - 1);
}

function setStatus(text) {
  statusEl.textContent = text;
}

function redraw() {
  ensurePanels();
  canvas.width = state.exportSize.w;
  canvas.height = state.exportSize.h;
  drawCover(ctx, { ...state, photos: state.photos.map((p) => p.img) }, canvas.width, canvas.height);
  syncControls();
}

/** Refresh control values (slider, selects, labels) from state. */
function syncControls() {
  const panel = state.panels[selectedPanel];
  const zoom = document.getElementById('zoom');
  if (zoom) zoom.value = String(panel.zoom);
  const zoomVal = document.getElementById('zoomVal');
  if (zoomVal) zoomVal.textContent = `${Math.round(panel.zoom * 100)}%`;
  const fitBtn = document.getElementById('fitToggle');
  if (fitBtn) fitBtn.textContent = panel.fit === 'fill' ? 'Fill panel' : 'Fit whole photo';
  const photoSel = document.getElementById('panelPhoto');
  if (photoSel) {
    photoSel.innerHTML = '';
    state.photos.forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `${i + 1}. ${p.name}`;
      photoSel.appendChild(opt);
    });
    photoSel.value = String(panel.photo);
  }
  document.querySelectorAll('[data-panel]').forEach((el) => {
    el.classList.toggle('selected', Number(el.dataset.panel) === selectedPanel);
  });
  const selLabel = document.getElementById('selectedLabel');
  if (selLabel) selLabel.textContent = `Panel ${selectedPanel + 1} of ${state.panels.length}`;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function addPhoto(img, name, kind) {
  if (state.photos.length >= MAX_PHOTOS) {
    setStatus(`Already ${MAX_PHOTOS} photos — remove one first (reload to reset).`);
    return -1;
  }
  state.photos.push({ img, name, kind });
  return state.photos.length - 1;
}

async function loadSample(name) {
  const img = await loadImage(SAMPLES[name]);
  const idx = await addPhoto(img, name === 'pier' ? 'Pier (sample)' : 'Boulevard (sample)', 'sample');
  if (idx >= 0) {
    state.panels.forEach((p) => { if (state.photos.length === 1) p.photo = 0; });
    setStatus(`Loaded sample photo: ${name}.`);
    redraw();
  }
  return idx;
}

async function addUploads(files) {
  let added = 0;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    const img = await loadImage(dataUrl);
    const idx = await addPhoto(img, file.name, 'upload');
    if (idx < 0) break;
    added++;
  }
  if (added > 0) {
    setStatus(`Added ${added} photo${added > 1 ? 's' : ''} — pick a panel, then choose its photo.`);
    renderTray();
    redraw();
  }
}

function renderTray() {
  const tray = document.getElementById('tray');
  tray.innerHTML = '';
  state.photos.forEach((p, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = `${i + 1}. ${p.name}`;
    chip.title = 'Use this photo in the selected panel';
    chip.addEventListener('click', () => {
      state.panels[selectedPanel].photo = i;
      setStatus(`Panel ${selectedPanel + 1} now shows “${p.name}”.`);
      redraw();
    });
    tray.appendChild(chip);
  });
  if (state.photos.length === 0) {
    tray.textContent = 'No photos yet — load a sample below.';
  }
}

// ---- export ---------------------------------------------------------------
function exportPNG(size) {
  const off = document.createElement('canvas');
  off.width = size.w;
  off.height = size.h;
  const octx = off.getContext('2d');
  ensurePanels();
  drawCover(octx, { ...state, photos: state.photos.map((p) => p.img) }, size.w, size.h);
  return new Promise((resolve) => {
    off.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sunset-cover-${size.w}x${size.h}.png`;
      a.click();
      setStatus(`Exported sunset-cover-${size.w}x${size.h}.png`);
      resolve(blob);
    }, 'image/png');
  });
}

// ---- panel interaction on the preview ------------------------------------
function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

let dragging = null;
canvas.addEventListener('pointerdown', (event) => {
  const p = canvasPoint(event);
  const rects = layoutPanels(state.layout, canvas.width, canvas.height);
  const hit = panelAt(rects, p.x, p.y);
  if (hit < 0) return;
  selectedPanel = hit;
  dragging = { x: p.x, y: p.y };
  canvas.setPointerCapture(event.pointerId);
  syncControls();
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const p = canvasPoint(event);
  const panel = state.panels[selectedPanel];
  const rect = layoutPanels(state.layout, canvas.width, canvas.height)[selectedPanel];
  panel.ox = clampPan(panel.ox + (p.x - dragging.x) / rect.w, panel.zoom);
  panel.oy = clampPan(panel.oy + (p.y - dragging.y) / rect.h, panel.zoom);
  dragging = { x: p.x, y: p.y };
  redraw();
});
canvas.addEventListener('pointerup', () => { dragging = null; });
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const panel = state.panels[selectedPanel];
  panel.zoom = clampZoom(panel.zoom * Math.exp(-event.deltaY * 0.0012));
  setStatus(`Panel ${selectedPanel + 1} zoom ${Math.round(panel.zoom * 100)}%.`);
  redraw();
}, { passive: false });
canvas.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 0.04 : 0.01;
  const panel = state.panels[selectedPanel];
  if (event.key === 'ArrowLeft') { panel.ox = clampPan(panel.ox - step, panel.zoom); event.preventDefault(); }
  else if (event.key === 'ArrowRight') { panel.ox = clampPan(panel.ox + step, panel.zoom); event.preventDefault(); }
  else if (event.key === 'ArrowUp') { panel.oy = clampPan(panel.oy - step, panel.zoom); event.preventDefault(); }
  else if (event.key === 'ArrowDown') { panel.oy = clampPan(panel.oy + step, panel.zoom); event.preventDefault(); }
  else return;
  redraw();
});
canvas.addEventListener('dragover', (event) => event.preventDefault());
canvas.addEventListener('drop', (event) => {
  event.preventDefault();
  if (event.dataTransfer?.files?.length) addUploads(event.dataTransfer.files);
});

// ---- controls -------------------------------------------------------------
function buildButtons(containerId, items, current, onPick) {
  const box = document.getElementById(containerId);
  box.innerHTML = '';
  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pill' + (item.id === current ? ' active' : '');
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      onPick(item.id);
      buildButtons(containerId, items, item.id, onPick);
      redraw();
    });
    box.appendChild(btn);
  });
}

function buildControls() {
  buildButtons('layouts', LAYOUTS.map((id) => ({ id, label: LAYOUT_LABELS[id] })), state.layout, (id) => {
    state.layout = id;
    setStatus(`Layout: ${LAYOUT_LABELS[id]}.`);
  });
  buildButtons('grades', GRADES.map((g) => ({ id: g.id, label: g.name })), state.gradeId, (id) => {
    state.gradeId = id;
    setStatus(`Grade: ${GRADES.find((g) => g.id === id).name}.`);
  });
  buildButtons('paints', CAPTION_PAINT_IDS.map((id) => ({ id, label: CAPTION_PAINTS[id].label })), state.captionPaint, (id) => {
    state.captionPaint = id;
  });
  buildButtons('sizes', EXPORT_SIZES.map((s) => ({ id: s.id, label: s.label })), state.exportSize.id, (id) => {
    state.exportSize = EXPORT_SIZES.find((s) => s.id === id);
    setStatus(`Export size: ${state.exportSize.label}. Preview redrawn at that size.`);
  });

  document.getElementById('title').addEventListener('input', (e) => { state.title = e.target.value; redraw(); });
  document.getElementById('subtitle').addEventListener('input', (e) => { state.subtitle = e.target.value; redraw(); });
  document.getElementById('titleSize').addEventListener('input', (e) => {
    state.titlePct = Number(e.target.value);
    document.getElementById('titleSizeVal').textContent = `${state.titlePct}%`;
    redraw();
  });
  document.getElementById('captionPos').addEventListener('change', (e) => { state.captionPos = e.target.value; redraw(); });
  document.getElementById('outline').addEventListener('change', (e) => { state.outline = e.target.checked; redraw(); });
  document.getElementById('frame').addEventListener('change', (e) => { state.frame = e.target.checked; redraw(); });
  document.getElementById('zoom').addEventListener('input', (e) => {
    state.panels[selectedPanel].zoom = clampZoom(Number(e.target.value));
    redraw();
  });
  document.getElementById('fitToggle').addEventListener('click', () => {
    const panel = state.panels[selectedPanel];
    panel.fit = panel.fit === 'fill' ? 'fit' : 'fill';
    const fresh = freshPanel(panel.photo, selectedPanel);
    panel.ox = fresh.ox; panel.oy = fresh.oy; panel.zoom = fresh.zoom;
    setStatus(`Panel ${selectedPanel + 1}: ${panel.fit === 'fill' ? 'fill (crop to panel)' : 'fit (whole photo)'}.`);
    redraw();
  });
  document.getElementById('resetPanel').addEventListener('click', () => {
    state.panels[selectedPanel] = freshPanel(state.panels[selectedPanel].photo, selectedPanel);
    setStatus(`Panel ${selectedPanel + 1} reset.`);
    redraw();
  });
  document.getElementById('allPanels').addEventListener('click', () => {
    const photo = state.panels[selectedPanel].photo;
    state.panels.forEach((p) => { p.photo = photo; });
    setStatus('All panels now use the same photo.');
    redraw();
  });
  document.getElementById('panelPhoto').addEventListener('change', (e) => {
    state.panels[selectedPanel].photo = Number(e.target.value);
    redraw();
  });
  document.getElementById('upload').addEventListener('change', (e) => addUploads(e.target.files));
  document.getElementById('loadPier').addEventListener('click', () => loadSample('pier').then(renderTray));
  document.getElementById('loadBoulevard').addEventListener('click', () => loadSample('boulevard').then(renderTray));
  document.getElementById('exportBtn').addEventListener('click', () => exportPNG(state.exportSize));
  document.querySelectorAll('[data-panel]').forEach((el) => {
    el.addEventListener('click', () => { selectedPanel = Number(el.dataset.panel); syncControls(); });
  });
}

// ---- boot -----------------------------------------------------------------
async function boot() {
  buildControls();
  ensurePanels();
  try { await document.fonts.load('40px Anton'); } catch { /* fallback font */ }
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  if (shot) {
    await runShot(shot, params, async (scene) => {
      state.layout = LAYOUTS.includes(scene.layout) ? scene.layout : 'strip3';
      state.gradeId = scene.grade;
      state.captionPaint = CAPTION_PAINTS[scene.paint] ? scene.paint : 'sunset';
      state.title = scene.caption;
      state.subtitle = scene.subtitle;
      document.getElementById('title').value = scene.caption;
      document.getElementById('subtitle').value = scene.subtitle;
      const idx = await loadSample(scene.photo);
      if (idx >= 0) state.panels.forEach((p) => { p.photo = idx; });
      state.exportSize = { id: 'shot', label: `${scene.width} × ${scene.height}`, w: scene.width, h: scene.height };
      renderTray();
      redraw();
    });
  } else {
    await loadSample('pier');
    renderTray();
    redraw();
    setStatus('Pier sample loaded — drag a panel to pan, scroll to zoom, then export.');
  }
}

// Handle for the Playwright live test.
window.__studio = { state, redraw, exportPNG, loadSample, get selectedPanel() { return selectedPanel; } };

boot();
