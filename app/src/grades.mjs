// Colour grades, headline inks and export sizes for Sunset Cover Studio.
// Every value here is the app's fixed palette: the grades are the four named
// looks, the inks are the four headline colours, and the export sizes are
// the three common post sizes the bounty asks for.

/** One colour grade: a three-stop wash, a blend mode, a strength and a sky. */
export const GRADES = {
  vice: {
    id: 'vice',
    name: 'Vice Sunset',
    stops: [
      [0.0, '#ff2e88'],
      [0.5, '#ff6a3d'],
      [1.0, '#ffc53d'],
    ],
    mode: 'overlay',
    strength: 0.55,
    sky: '#2b0a3d',
  },
  pastel: {
    id: 'pastel',
    name: 'Pastel Dawn',
    stops: [
      [0.0, '#ffb3d9'],
      [0.5, '#ffd9a0'],
      [1.0, '#b8c6ff'],
    ],
    mode: 'soft-light',
    strength: 0.5,
    sky: '#3d2b52',
  },
  neon: {
    id: 'neon',
    name: 'Neon Nights',
    stops: [
      [0.0, '#00e5ff'],
      [0.5, '#b537f2'],
      [1.0, '#ff2e88'],
    ],
    mode: 'overlay',
    strength: 0.6,
    sky: '#0a0620',
  },
  gold: {
    id: 'gold',
    name: 'Palm Gold',
    stops: [
      [0.0, '#ffd76a'],
      [0.5, '#ff9e4d'],
      [1.0, '#2ec4b6'],
    ],
    mode: 'soft-light',
    strength: 0.5,
    sky: '#1d2b1f',
  },
};

/** One headline ink: a fill colour and the shadow drawn behind the letters. */
export const INKS = {
  white: { id: 'white', name: 'White', color: '#ffffff', shadow: 'rgba(20,0,30,0.6)' },
  gold: { id: 'gold', name: 'Gold', color: '#ffd76a', shadow: 'rgba(60,10,0,0.65)' },
  neon: { id: 'neon', name: 'Neon Pink', color: '#ff5da2', shadow: 'rgba(0,20,40,0.65)' },
  midnight: { id: 'midnight', name: 'Midnight', color: '#14101e', shadow: 'rgba(255,255,255,0.45)' },
};

/** The three PNG sizes the cover exports to, in the common post sizes. */
export const EXPORT_SIZES = [
  { id: 'square', w: 1080, h: 1080, label: '1080 × 1080' },
  { id: 'portrait', w: 1080, h: 1350, label: '1080 × 1350' },
  { id: 'wide', w: 1920, h: 1080, label: '1920 × 1080' },
];

/** The grade for an id, falling back to Vice Sunset for an unknown id. */
export function gradeById(id) {
  return GRADES[id] ?? GRADES.vice;
}

/** The headline ink for an id, falling back to White for an unknown id. */
export function inkById(id) {
  return INKS[id] ?? INKS.white;
}

/** The export size for a "WxH" string or an id, falling back to the square. */
export function exportSizeById(id) {
  if (typeof id === 'string') {
    const byLabel = EXPORT_SIZES.find((s) => s.id === id);
    if (byLabel) return byLabel;
    const m = /^(\d+)x(\d+)$/.exec(id);
    if (m) {
      const found = EXPORT_SIZES.find((s) => s.w === Number(m[1]) && s.h === Number(m[2]));
      if (found) return found;
    }
  }
  return EXPORT_SIZES[0];
}

/** Clamps a number into [min, max]. */
export function clampNumber(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** The wash alpha for a grade at an intensity slider value of 0–100. */
export function gradeAlpha(grade, intensity) {
  return grade.strength * clampNumber(intensity, 0, 100) / 100;
}
