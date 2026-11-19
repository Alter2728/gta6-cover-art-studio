// Fixed scenes for screenshots: ?scene=cover shows the exported cover
// full-bleed on the canvas; ?scene=editor shows the editor with a photo
// loaded. The query also carries layout, grade, headline and tagline, so
// each screenshot is a reproducible fixed scene. window.__shotReady is
// set once the scene has painted.

/** The scene parameters from a query string, with sensible defaults. */
export function sceneParams(query) {
  const get = (name, fallback) => {
    const v = query.get(name);
    return v === null || v === '' ? fallback : v;
  };
  return {
    scene: get('scene', 'editor'),
    layout: get('layout', 'strip3'),
    grade: get('grade', 'vice'),
    ink: get('ink', 'white'),
    headline: get('headline', 'VICE CITY'),
    tagline: get('tagline', 'Welcome back to Vice City'),
    photo: get('photo', 'pier'),
  };
}

/**
 * Runs a fixed scene: applies its layout/grade/headline, loads its sample
 * photo, paints, then flags window.__shotReady. `app` is the wiring object
 * from main.mjs: { applyScene(params), loadSample(name), redraw() }.
 */
export async function runScene(scene, query, app) {
  const params = sceneParams(query);
  app.applyScene(params);
  await app.loadSample(params.photo);
  if (scene === 'cover' || params.scene === 'cover') {
    document.body.classList.add('shot-cover');
  }
  app.redraw();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
}
