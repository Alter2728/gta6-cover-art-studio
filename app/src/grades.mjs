// Colour grades for Sunset Cover Studio (round 2).
//
// A grade is drawn onto the canvas itself — a canvas filter while the photo
// is painted, plus gradient tints on top — so an exported PNG carries the
// grade. Nothing here is a CSS-only effect.
//
// Each grade stores its filter as numbers (saturate / contrast / brightness
// in plain multipliers, hue in degrees) so the editor's intensity slider
// can blend the grade from "off" (all 1s, hue 0) to full strength. Each
// tint layer is a gradient with an alpha that the same slider scales.

export const GRADE_LIST = [
  {
    id: 'sunset',
    name: 'Vice Sunset',
    note: 'Warm orange and pink, golden-hour contrast.',
    parts: { saturate: 1.35, contrast: 1.12, brightness: 1.03, hue: 0 },
    tints: [
      {
        x0: 0, y0: 0.45, x1: 0, y1: 1, alpha: 0.5,
        stops: [[0, 'rgba(255,120,60,0)'], [1, 'rgba(214,48,120,1)']],
      },
      {
        x0: 0, y0: 0, x1: 0, y1: 0.35, alpha: 0.22,
        stops: [[0, 'rgba(255,190,90,1)'], [1, 'rgba(255,190,90,0)']],
      },
    ],
  },
  {
    id: 'neon',
    name: 'Neon Nights',
    note: 'Magenta and cyan night street, saturation pushed hard.',
    parts: { saturate: 1.55, contrast: 1.18, brightness: 1.0, hue: -14 },
    tints: [
      {
        x0: 0, y0: 0, x1: 1, y1: 1, alpha: 0.3,
        stops: [[0, 'rgba(255,0,160,1)'], [0.55, 'rgba(255,0,160,0)'], [1, 'rgba(0,220,255,1)']],
      },
      {
        x0: 0, y0: 0.6, x1: 0, y1: 1, alpha: 0.45,
        stops: [[0, 'rgba(20,0,60,0)'], [1, 'rgba(20,0,60,1)']],
      },
    ],
  },
  {
    id: 'noir',
    name: 'Palm Noir',
    note: 'Dark and moody, washed out with a heavy shadow feel.',
    parts: { saturate: 0.55, contrast: 1.28, brightness: 0.86, hue: 0 },
    tints: [
      {
        x0: 0, y0: 0, x1: 0, y1: 1, alpha: 0.55,
        stops: [[0, 'rgba(8,12,40,1)'], [1, 'rgba(8,12,40,1)']],
      },
    ],
  },
  {
    id: 'dawn',
    name: 'Pastel Dawn',
    note: 'Soft pink and blue morning, gentle and bright.',
    parts: { saturate: 1.15, contrast: 0.95, brightness: 1.09, hue: 0 },
    tints: [
      {
        x0: 0, y0: 0, x1: 0, y1: 1, alpha: 0.22,
        stops: [[0, 'rgba(150,200,255,1)'], [1, 'rgba(255,170,200,1)']],
      },
    ],
  },
];

export function gradeLookup(id) {
  return GRADE_LIST.find((g) => g.id === id) ?? GRADE_LIST[0];
}

// Blend one filter number toward its neutral value (1 for the multipliers,
// 0 for hue) by strength 0..1.
function blendPart(full, neutral, strength) {
  return neutral + (full - neutral) * strength;
}

// The canvas filter string for a grade at a given intensity (0..1).
// At 0 the photo is untouched; at 1 the grade is at full strength.
export function gradeFilter(grade, strength) {
  const s = Math.min(1, Math.max(0, strength));
  const p = grade.parts;
  const sat = blendPart(p.saturate, 1, s);
  const con = blendPart(p.contrast, 1, s);
  const bri = blendPart(p.brightness, 1, s);
  const hue = blendPart(p.hue, 0, s);
  const bits = [
    `saturate(${sat.toFixed(3)})`,
    `contrast(${con.toFixed(3)})`,
    `brightness(${bri.toFixed(3)})`,
  ];
  if (Math.abs(hue) > 0.5) bits.push(`hue-rotate(${hue.toFixed(1)}deg)`);
  return bits.join(' ');
}

// A tint layer's overall alpha at a given intensity.
export function tintAlpha(layer, strength) {
  return layer.alpha * Math.min(1, Math.max(0, strength));
}

// Headline ink presets: either a flat fill or a left-to-right gradient
// across the headline's width.
export const TITLE_INKS = {
  white: { label: 'White', fill: '#ffffff' },
  sunset: { label: 'Sunset gradient', gradient: ['#ffd76a', '#ff5e7a', '#ff9d00'] },
  neon: { label: 'Neon gradient', gradient: ['#ff2ea6', '#b04dff', '#21d8ff'] },
  gold: { label: 'Gold', gradient: ['#fff3a6', '#ffc233', '#ff8a00'] },
};

export const TITLE_INK_IDS = ['white', 'sunset', 'neon', 'gold'];

export function inkLookup(id) {
  return TITLE_INKS[id] ?? TITLE_INKS.white;
}

// Ready-made headline + tagline pairs for the preset buttons.
export const HEADLINE_PRESETS = [
  { headline: 'VICE CITY', tagline: 'A Sunset Story' },
  { headline: 'SUNSET DRIVE', tagline: 'Coast to Coast' },
  { headline: 'NEON RIDE', tagline: 'After Dark in the City' },
  { headline: 'PIER PRESSURE', tagline: 'One Last Score' },
];
