// Sunset Cover Studio (round 2) — the editor wiring: photos, frames,
// headline, tints, effects and export. The render engine lives in
// cover.mjs; this file only moves state around and calls renderPoster for
// the preview and for exports.
import { renderPoster, rectsFor, hitPanel, EXPORT_PRESETS } from './cover.mjs';
import { PANEL_LAYOUTS, labelForLayout, frameCountFor, limitZoom, limitShift } from './layouts.mjs';
import { GRADE_LIST, gradeLookup, TITLE_INKS, TITLE_INK_IDS, HEADLINE_PRESETS } from './grades.mjs';
import { runScene } from './shots.mjs';

const MAX_PHOTOS = 3;
const SAMPLES = { pier: 'samples/pier.jpg', boulevard: 'samples/boulevard.jpg' };

const canvas = document.getElementById('preview');
const statusEl = document.getElementById('statusLine');
const ctx = canvas.getContext('2d');

// One poster, as the renderer reads it. pictures hold loaded images;
// frames hold one crop per layout rectangle.
const poster = {
  arrangement: 'strip3',
  tint: 'sunset',
  tintStrength: 1,
  glow: 0.6,
  grain: false,
  vignette: true,
  outerFrame: true,
  headline: 'VICE CITY',
  tagline: 'A Sunset Story',
  headlineScale: 11,
  headlineSide: 'bottom',
  ink: 'sunset',
  inkOutline: true,
  exportPreset: EXPORT_PRESETS[2],
  pictures: [], // { img, name, kind }
  frames: [], // { picture, zoom, dx, dy, mode }
};
let activeFrame = 0;

// Each frame starts on a different crop of its photo, so one photo spread
// across three frames reads as three different shots.
const STAGGER = [
  { zoom: 1, dx: 0, dy: 0 },
  { zoom: 1.4, dx: -0.09, dy: 0.06 },
  { zoom: 1.25, dx: 0.07, dy: -0.05 },
  { zoom: 1.5, dx: -0.05, dy: -0.04 },
];
function freshFrame(picture = 0, index = 0) {
  const s = STAGGER[index % STAGGER.length];
  return { picture, zoom: s.zoom, dx: s.dx, dy: s.dy, mode: 'cover' };
}

// Keep one frame entry per rectangle of the current arrangement, keeping
// any crops the user already made.
function ensureFrames() {
  const count = frameCountFor(poster.arrangement);
  while (poster.frames.length < count) poster.frames.push(freshFrame(0, poster.frames.length));
  poster.frames.length = count;
  activeFrame = Math.min(activeFrame, count - 1);
}

function setStatus(text) {
  statusEl.textContent = text;
}

function redraw() {
  ensureFrames();
  canvas.width = poster.exportPreset.w;
  canvas.height = poster.exportPreset.h;
  renderPoster(ctx, { ...poster, pictures: poster.pictures.map((p) => p.img) }, canvas.width, canvas.height);
  syncControls();
}

// Refresh the controls (sliders, selects, labels) from the poster state.
function syncControls() {
  const frame = poster.frames[activeFrame];
  const zoom = document.getElementById('frameZoom');
  if (zoom) zoom.value = String(frame.zoom);
  const zoomVal = document.getElementById('frameZoomVal');
  if (zoomVal) zoomVal.textContent = `${Math.round(frame.zoom * 100)}%`;
  const fitBtn = document.getElementById('fitModeBtn');
  if (fitBtn) fitBtn.textContent = frame.mode === 'cover' ? 'Fill frame' : 'Fit whole photo';
  const photoSel = document.getElementById('framePhoto');
  if (photoSel) {
    photoSel.innerHTML = '';
    poster.pictures.forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `${i + 1}. ${p.name}`;
      photoSel.appendChild(opt);
    });
    photoSel.value = String(frame.picture);
  }
  document.querySelectorAll('[data-frame]').forEach((el) => {
    el.classList.toggle('selected', Number(el.dataset.frame) === activeFrame);
  });
  const label = document.getElementById('frameLabel');
  if (label) label.textContent = `Frame ${activeFrame + 1} of ${poster.frames.length}`;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function addPicture(img, name, kind) {
  if (poster.pictures.length >= MAX_PHOTOS) {
    setStatus(`Already ${MAX_PHOTOS} photos — remove one first (reload to reset).`);
    return -1;
  }
  poster.pictures.push({ img, name, kind });
  return poster.pictures.length - 1;
}

async function loadSample(name) {
  const img = await loadImage(SAMPLES[name]);
  const idx = await addPicture(img, name === 'pier' ? 'Pier (sample)' : 'Boulevard (sample)', 'sample');
  if (idx >= 0) {
    poster.frames.forEach((f) => { if (poster.pictures.length === 1) f.picture = 0; });
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
    const idx = await addPicture(img, file.name, 'upload');
    if (idx < 0) break;
    added += 1;
  }
  if (added > 0) {
    setStatus(`Added ${added} photo${added > 1 ? 's' : ''} — pick a frame, then choose its photo.`);
    renderTray();
    redraw();
  }
}

function renderTray() {
  const tray = document.getElementById('photoTray');
  tray.innerHTML = '';
  poster.pictures.forEach((p, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = `${i + 1}. ${p.name}`;
    chip.title = 'Use this photo in the selected frame';
    chip.addEventListener('click', () => {
      poster.frames[activeFrame].picture = i;
      setStatus(`Frame ${activeFrame + 1} now shows “${p.name}”.`);
      redraw();
    });
    tray.appendChild(chip);
  });
  if (poster.pictures.length === 0) {
    tray.textContent = 'No photos yet — load a sample below.';
  }
}

// ---- export ---------------------------------------------------------------
function exportPNG(preset) {
  const off = document.createElement('canvas');
  off.width = preset.w;
  off.height = preset.h;
  const octx = off.getContext('2d');
  ensureFrames();
  renderPoster(octx, { ...poster, pictures: poster.pictures.map((p) => p.img) }, preset.w, preset.h);
  return new Promise((resolve) => {
    off.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sunset-cover-${preset.w}x${preset.h}.png`;
      a.click();
      setStatus(`Exported sunset-cover-${preset.w}x${preset.h}.png`);
      resolve(blob);
    }, 'image/png');
  });
}

// ---- frame interaction on the preview -------------------------------------
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
  const rects = rectsFor(poster.arrangement, canvas.width, canvas.height);
  const hit = hitPanel(rects, p.x, p.y);
  if (hit < 0) return;
  activeFrame = hit;
  dragging = { x: p.x, y: p.y };
  canvas.setPointerCapture(event.pointerId);
  syncControls();
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const p = canvasPoint(event);
  const frame = poster.frames[activeFrame];
  const rect = rectsFor(poster.arrangement, canvas.width, canvas.height)[activeFrame];
  frame.dx = limitShift(frame.dx + (p.x - dragging.x) / rect.w, frame.zoom);
  frame.dy = limitShift(frame.dy + (p.y - dragging.y) / rect.h, frame.zoom);
  dragging = { x: p.x, y: p.y };
  redraw();
});
canvas.addEventListener('pointerup', () => { dragging = null; });
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const frame = poster.frames[activeFrame];
  frame.zoom = limitZoom(frame.zoom * Math.exp(-event.deltaY * 0.0012));
  setStatus(`Frame ${activeFrame + 1} zoom ${Math.round(frame.zoom * 100)}%.`);
  redraw();
}, { passive: false });
canvas.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 0.04 : 0.01;
  const frame = poster.frames[activeFrame];
  if (event.key === 'ArrowLeft') { frame.dx = limitShift(frame.dx - step, frame.zoom); event.preventDefault(); }
  else if (event.key === 'ArrowRight') { frame.dx = limitShift(frame.dx + step, frame.zoom); event.preventDefault(); }
  else if (event.key === 'ArrowUp') { frame.dy = limitShift(frame.dy - step, frame.zoom); event.preventDefault(); }
  else if (event.key === 'ArrowDown') { frame.dy = limitShift(frame.dy + step, frame.zoom); event.preventDefault(); }
  else return;
  redraw();
});
canvas.addEventListener('dragover', (event) => event.preventDefault());
canvas.addEventListener('drop', (event) => {
  event.preventDefault();
  if (event.dataTransfer?.files?.length) addUploads(event.dataTransfer.files);
});

// ---- controls -------------------------------------------------------------
function buildPills(containerId, items, current, onPick) {
  const box = document.getElementById(containerId);
  box.innerHTML = '';
  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pill' + (item.id === current ? ' active' : '');
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      onPick(item.id);
      buildPills(containerId, items, item.id, onPick);
      redraw();
    });
    box.appendChild(btn);
  });
}

function applyPreset(preset) {
  poster.headline = preset.headline;
  poster.tagline = preset.tagline;
  document.getElementById('headline').value = preset.headline;
  document.getElementById('tagline').value = preset.tagline;
  setStatus(`Caption preset: “${preset.headline}”.`);
  redraw();
}

function refreshPills() {
  buildPills('arrangementPills', PANEL_LAYOUTS.map((l) => ({ id: l.id, label: l.name })), poster.arrangement, (id) => {
    poster.arrangement = id;
    setStatus(`Layout: ${labelForLayout(id)}.`);
  });
  buildPills('tintPills', GRADE_LIST.map((g) => ({ id: g.id, label: g.name })), poster.tint, (id) => {
    poster.tint = id;
    setStatus(`Grade: ${gradeLookup(id).name}.`);
  });
  buildPills('inkPills', TITLE_INK_IDS.map((id) => ({ id, label: TITLE_INKS[id].label })), poster.ink, (id) => {
    poster.ink = id;
  });
}

function shuffleComposition() {
  const layouts = PANEL_LAYOUTS.map((l) => l.id);
  poster.arrangement = layouts[Math.floor(Math.random() * layouts.length)];
  poster.tint = GRADE_LIST[Math.floor(Math.random() * GRADE_LIST.length)].id;
  const inks = TITLE_INK_IDS;
  poster.ink = inks[Math.floor(Math.random() * inks.length)];
  poster.frames.forEach((f) => {
    const fresh = freshFrame(f.picture, Math.floor(Math.random() * STAGGER.length));
    f.zoom = fresh.zoom; f.dx = fresh.dx; f.dy = fresh.dy;
  });
  refreshPills();
  setStatus('Shuffled — a fresh composition. Shuffle again or tweak it.');
  redraw();
}

function buildControls() {
  refreshPills();
  buildPills('exportPills', EXPORT_PRESETS.map((s) => ({ id: s.id, label: s.label })), poster.exportPreset.id, (id) => {
    poster.exportPreset = EXPORT_PRESETS.find((s) => s.id === id);
    setStatus(`Export size: ${poster.exportPreset.label}. Preview redrawn at that size.`);
  });
  buildPills('presetPills', HEADLINE_PRESETS.map((p) => ({ id: p.headline, label: p.headline })), null, (id) => {
    applyPreset(HEADLINE_PRESETS.find((p) => p.headline === id));
  });

  document.getElementById('headline').addEventListener('input', (e) => { poster.headline = e.target.value; redraw(); });
  document.getElementById('tagline').addEventListener('input', (e) => { poster.tagline = e.target.value; redraw(); });
  document.getElementById('headlineSize').addEventListener('input', (e) => {
    poster.headlineScale = Number(e.target.value);
    document.getElementById('headlineSizeVal').textContent = `${poster.headlineScale}%`;
    redraw();
  });
  document.getElementById('headlineSide').addEventListener('change', (e) => { poster.headlineSide = e.target.value; redraw(); });
  document.getElementById('tintStrength').addEventListener('input', (e) => {
    poster.tintStrength = Number(e.target.value);
    document.getElementById('tintStrengthVal').textContent = `${Math.round(poster.tintStrength * 100)}%`;
    redraw();
  });
  document.getElementById('glow').addEventListener('input', (e) => {
    poster.glow = Number(e.target.value);
    document.getElementById('glowVal').textContent = `${Math.round(poster.glow * 100)}%`;
    redraw();
  });
  document.getElementById('inkOutline').addEventListener('change', (e) => { poster.inkOutline = e.target.checked; redraw(); });
  document.getElementById('outerFrame').addEventListener('change', (e) => { poster.outerFrame = e.target.checked; redraw(); });
  document.getElementById('grain').addEventListener('change', (e) => { poster.grain = e.target.checked; redraw(); });
  document.getElementById('vignette').addEventListener('change', (e) => { poster.vignette = e.target.checked; redraw(); });
  document.getElementById('frameZoom').addEventListener('input', (e) => {
    poster.frames[activeFrame].zoom = limitZoom(Number(e.target.value));
    redraw();
  });
  document.getElementById('fitModeBtn').addEventListener('click', () => {
    const frame = poster.frames[activeFrame];
    frame.mode = frame.mode === 'cover' ? 'contain' : 'cover';
    const fresh = freshFrame(frame.picture, activeFrame);
    frame.dx = fresh.dx; frame.dy = fresh.dy; frame.zoom = fresh.zoom;
    setStatus(`Frame ${activeFrame + 1}: ${frame.mode === 'cover' ? 'fill (crop to frame)' : 'fit (whole photo)'}.`);
    redraw();
  });
  document.getElementById('resetFrameBtn').addEventListener('click', () => {
    poster.frames[activeFrame] = freshFrame(poster.frames[activeFrame].picture, activeFrame);
    setStatus(`Frame ${activeFrame + 1} reset.`);
    redraw();
  });
  document.getElementById('fillAllFrames').addEventListener('click', () => {
    const picture = poster.frames[activeFrame].picture;
    poster.frames.forEach((f) => { f.picture = picture; });
    setStatus('All frames now use the same photo.');
    redraw();
  });
  document.getElementById('framePhoto').addEventListener('change', (e) => {
    poster.frames[activeFrame].picture = Number(e.target.value);
    redraw();
  });
  document.getElementById('upload').addEventListener('change', (e) => addUploads(e.target.files));
  document.getElementById('samplePier').addEventListener('click', () => loadSample('pier').then(renderTray));
  document.getElementById('sampleBoulevard').addEventListener('click', () => loadSample('boulevard').then(renderTray));
  document.getElementById('shuffleBtn').addEventListener('click', shuffleComposition);
  document.getElementById('exportBtn').addEventListener('click', () => exportPNG(poster.exportPreset));
  document.querySelectorAll('[data-frame]').forEach((el) => {
    el.addEventListener('click', () => { activeFrame = Number(el.dataset.frame); syncControls(); });
  });
}

// ---- boot -----------------------------------------------------------------
async function boot() {
  buildControls();
  ensureFrames();
  try { await document.fonts.load('40px Anton'); } catch { /* fallback font */ }
  const params = new URLSearchParams(location.search);
  const scene = params.get('scene');
  if (scene) {
    await runScene(scene, params, async (shot) => {
      poster.arrangement = PANEL_LAYOUTS.some((l) => l.id === shot.arrangement) ? shot.arrangement : 'strip3';
      poster.tint = shot.tint;
      poster.ink = TITLE_INKS[shot.ink] ? shot.ink : 'sunset';
      poster.headline = shot.headline;
      poster.tagline = shot.tagline;
      document.getElementById('headline').value = shot.headline;
      document.getElementById('tagline').value = shot.tagline;
      const idx = await loadSample(shot.photo);
      if (idx >= 0) poster.frames.forEach((f) => { f.picture = idx; });
      // A second sample photo, when the scene names one, alternates across
      // the frames — a cover with two different photos reads far more like
      // a poster than one photo repeated.
      if (shot.photo2) {
        const idx2 = await loadSample(shot.photo2);
        if (idx2 >= 0) poster.frames.forEach((f, i) => { if (i % 2 === 1) f.picture = idx2; });
      }
      poster.exportPreset = { id: 'scene', label: `${shot.width} × ${shot.height}`, w: shot.width, h: shot.height };
      renderTray();
      redraw();
    });
  } else {
    await loadSample('pier');
    renderTray();
    redraw();
    setStatus('Pier sample loaded — drag a frame to pan, scroll to zoom, then export.');
  }
}

// Handle for the Playwright live test. state is the live poster object so
// the test reads pictures/frames/arrangement straight off it.
window.__studio = {
  state: poster,
  redraw,
  exportPNG,
  loadSample,
  get selectedFrame() { return activeFrame; },
};

boot();
