// Colour grades for Sunset Cover Studio: four Vice City moods, each a vertical
// gradient washed over the photos. `intensity` (0-100) blends the grade from
// neutral (no tint at all) to its full strength, so the slider never lies.

export const GRADES = [
  {
    id: 'vice',
    name: 'Vice Sunset',
    // magenta dusk melting into orange, then gold at the foot
    stops: [
      [0.0, '#ff2e88'],
      [0.5, '#ff6a3d'],
      [1.0, '#ffc53d'],
    ],
    mode: 'overlay',
    strength: 0.55,
    sky: '#2b0a3d',
  },
  {
    id: 'pastel',
    name: 'Pastel Dawn',
    // soft pink morning: rose, peach, lavender
    stops: [
      [0.0, '#ffb3d9'],
      [0.5, '#ffd9a0'],
      [1.0, '#b8c6ff'],
    ],
    mode: 'soft-light',
    strength: 0.5,
    sky: '#3d2b52',
  },
  {
    id: 'neon',
    name: 'Neon Nights',
    // after-dark cyan into violet into hot pink
    stops: [
      [0.0, '#00e5ff'],
      [0.5, '#b537f2'],
      [1.0, '#ff2e88'],
    ],
    mode: 'overlay',
    strength: 0.6,
    sky: '#0a0620',
  },
  {
    id: 'gold',
    name: 'Palm Gold',
    // golden hour: amber over a teal dusk
    stops: [
      [0.0, '#ffd76a'],
      [0.5, '#ff9e4d'],
      [1.0, '#2ec4b6'],
    ],
    mode: 'soft-light',
    strength: 0.5,
    sky: '#1d2b1f',
  },
];

/** Looks a grade up by id, falling back to the first grade. */
export function gradeById(id) {
  return GRADES.find((g) => g.id === id) ?? GRADES[0];
}

/**
 * The wash a grade paints at a given slider intensity (0-100).
 * At 0 the alpha is 0: the photos stay exactly as they are.
 */
export function gradeWash(grade, intensity) {
  const clamped = Math.max(0, Math.min(100, intensity));
  return {
    mode: grade.mode,
    alpha: grade.strength * (clamped / 100),
    stops: grade.stops,
    sky: grade.sky,
  };
}

/** Headline ink colours: the lettering colour and its drop shadow. */
export const INKS = [
  { id: 'white', name: 'White', color: '#ffffff', shadow: 'rgba(20, 0, 30, 0.6)' },
  { id: 'gold', name: 'Gold', color: '#ffd76a', shadow: 'rgba(60, 10, 0, 0.65)' },
  { id: 'neon', name: 'Neon Pink', color: '#ff5da2', shadow: 'rgba(0, 20, 40, 0.65)' },
  { id: 'ink', name: 'Midnight', color: '#14101e', shadow: 'rgba(255, 255, 255, 0.45)' },
];

/** Looks an ink up by id, falling back to white. */
export function inkById(id) {
  return INKS.find((i) => i.id === id) ?? INKS[0];
}

/** The export sizes the bounty asks for, in pixels. */
export const EXPORT_SIZES = [
  { id: '1080x1080', label: 'Square 1080 x 1080', width: 1080, height: 1080 },
  { id: '1080x1350', label: 'Portrait 1080 x 1350', width: 1080, height: 1350 },
  { id: '1920x1080', label: 'Landscape 1920 x 1080', width: 1920, height: 1080 },
];

/** Looks an export size up by its "WxH" id, falling back to square. */
export function exportSizeById(id) {
  return EXPORT_SIZES.find((s) => s.id === id) ?? EXPORT_SIZES[0];
}

/** File name for a downloaded cover PNG. */
export function exportFileName(size) {
  return `sunset-cover-${size.width}x${size.height}.png`;
}
