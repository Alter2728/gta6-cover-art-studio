// Fixed scenes for screenshots: ?scene=cover shows the finished cover
// alone, full-viewport; ?scene=editor shows the editor with a sample photo
// loaded. Query extras: photo (pier|boulevard), headline, arrangement,
// tint, ink, w, h, tagline. window.__shotReady is set once the scene has
// painted, so the screenshot script knows when to shoot.
export function sceneFrom(query) {
  return {
    photo: query.get('photo') ?? 'pier',
    photo2: query.get('photo2') ?? null,
    headline: query.get('headline') ?? 'VICE CITY',
    tagline: query.get('tagline') ?? 'A Sunset Story',
    arrangement: query.get('arrangement') ?? 'strip3',
    tint: query.get('tint') ?? 'sunset',
    ink: query.get('ink') ?? 'sunset',
    width: Math.min(4000, Math.max(100, Number(query.get('w') ?? 1920))),
    height: Math.min(4000, Math.max(100, Number(query.get('h') ?? 1080))),
  };
}

export async function runScene(kind, query, setup) {
  const scene = sceneFrom(query);
  if (kind === 'cover') document.body.classList.add('scene-cover');
  await setup(scene);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}
