// Fixed scenes for screenshots: ?shot=cover shows the finished cover alone,
// full-viewport; ?shot=editor shows the editor with a sample photo loaded.
// Query extras: photo (pier|boulevard), caption, layout, grade, w, h,
// subtitle, paint. window.__shotReady is set once the scene has painted.
export async function runShot(shot, query, setup) {
  const scene = {
    photo: query.get('photo') ?? 'pier',
    caption: query.get('caption') ?? 'Sunset Heist',
    subtitle: query.get('subtitle') ?? 'A Vice City Story',
    layout: query.get('layout') ?? 'strip3',
    grade: query.get('grade') ?? 'sunset',
    paint: query.get('paint') ?? 'sunset',
    width: Number(query.get('w') ?? 1920),
    height: Number(query.get('h') ?? 1080),
  };
  if (shot === 'cover') document.body.classList.add('shot-cover');
  await setup(scene);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}
