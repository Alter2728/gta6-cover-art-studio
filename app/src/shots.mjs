// Fixed scenes for screenshots: ?scene=cover shows the exported cover alone,
// ?scene=editor shows the editor with sample photos loaded. The query picks
// the layout, grade, headline and tagline, and `photo` / `photo2` pick the
// sample photos (samples/<name>.jpg). window.__shotReady is set once the
// scene is painted, so the screenshot tool knows when to shoot.

import { defaultCrops } from './layouts.mjs';

const SAMPLES = ['boulevard', 'pier'];

/** Reads the scene description out of a URL query string. */
export function parseScene(search) {
  const q = new URLSearchParams(search);
  return {
    scene: q.get('scene') ?? 'editor',
    layout: q.get('layout') ?? 'strip3',
    grade: q.get('grade') ?? 'vice',
    headline: q.get('headline') ?? 'VICE CITY',
    tagline: q.get('tagline') ?? 'Welcome back to Vice City',
    ink: q.get('ink') ?? 'white',
    photo: SAMPLES.includes(q.get('photo')) ? q.get('photo') : 'pier',
    photo2: SAMPLES.includes(q.get('photo2')) ? q.get('photo2') : 'boulevard',
    intensity: Number(q.get('intensity') ?? 80),
    glow: Number(q.get('glow') ?? 70),
  };
}

/**
 * Sets a state up for a scene: two sample photos alternating across the
 * frames, the layout/grade/headline from the query. `loadImage` loads a
 * sample by name and returns the image.
 */
export async function applyScene(state, scene, loadImage) {
  state.layout = scene.layout;
  state.grade = scene.grade;
  state.headline = scene.headline;
  state.tagline = scene.tagline;
  state.ink = scene.ink;
  state.gradeIntensity = Number.isFinite(scene.intensity) ? scene.intensity : 80;
  state.neonGlow = Number.isFinite(scene.glow) ? scene.glow : 70;
  const first = await loadImage(`samples/${scene.photo}.jpg`);
  const second = await loadImage(`samples/${scene.photo2}.jpg`);
  state.photos = [first, second, null];
  // Two photos take turns across the frames.
  state.crops = defaultCrops(state.layout, 2);
  state.selectedFrame = 0;
  return state;
}

/**
 * Runs a scene: applies it, draws once, and marks the page ready.
 * In a cover scene the editor controls are hidden so the screenshot is the
 * cover alone.
 */
export async function runScene(scene, search, hooks) {
  const parsed = parseScene(search);
  if (parsed.scene === 'cover') document.body.classList.add('shot-cover');
  await applyScene(hooks.state, parsed, hooks.loadImage);
  hooks.redraw();
  await document.fonts.ready;
  hooks.redraw();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}
