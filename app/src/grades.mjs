// Colour grades for Sunset Cover Studio. Each grade is drawn onto the canvas
// itself (a canvas filter while the photo is drawn, plus gradient overlays),
// so an exported PNG carries the grade — it is never a CSS-only effect.

export const GRADES = [
  {
    id: 'sunset',
    name: 'Vice Sunset',
    blurb: 'Warm orange and pink, golden-hour contrast.',
    filter: 'saturate(1.35) contrast(1.12) brightness(1.03)',
    overlays: [
      { x0: 0, y0: 0.45, x1: 0, y1: 1, stops: [[0, 'rgba(255,120,60,0)'], [1, 'rgba(214,48,120,0.5)']] },
      { x0: 0, y0: 0, x1: 0, y1: 0.35, stops: [[0, 'rgba(255,190,90,0.22)'], [1, 'rgba(255,190,90,0)']] },
    ],
  },
  {
    id: 'neon',
    name: 'Neon Nights',
    blurb: 'Magenta and cyan night street, pushed saturation.',
    filter: 'saturate(1.55) contrast(1.18) hue-rotate(-14deg)',
    overlays: [
      { x0: 0, y0: 0, x1: 1, y1: 1, stops: [[0, 'rgba(255,0,160,0.28)'], [0.55, 'rgba(255,0,160,0)'], [1, 'rgba(0,220,255,0.3)']] },
      { x0: 0, y0: 0.6, x1: 0, y1: 1, stops: [[0, 'rgba(20,0,60,0)'], [1, 'rgba(20,0,60,0.45)']] },
    ],
  },
  {
    id: 'noir',
    name: 'Palm Noir',
    blurb: 'Dark and moody, desaturated with a heavy vignette feel.',
    filter: 'saturate(0.55) contrast(1.28) brightness(0.86)',
    overlays: [
      { x0: 0, y0: 0, x1: 0, y1: 1, stops: [[0, 'rgba(8,12,40,0.35)'], [1, 'rgba(8,12,40,0.55)']] },
    ],
  },
  {
    id: 'dawn',
    name: 'Pastel Dawn',
    blurb: 'Soft pink and blue morning, gentle and bright.',
    filter: 'saturate(1.15) contrast(0.95) brightness(1.09)',
    overlays: [
      { x0: 0, y0: 0, x1: 0, y1: 1, stops: [[0, 'rgba(150,200,255,0.2)'], [1, 'rgba(255,170,200,0.22)']] },
    ],
  },
];

export function gradeById(id) {
  return GRADES.find((g) => g.id === id) ?? GRADES[0];
}

// Caption paint presets: the fill is either a flat colour or a gradient
// described as [startColour, endColour] across the title's width.
export const CAPTION_PAINTS = {
  white: { label: 'White', fill: '#ffffff' },
  sunset: { label: 'Sunset gradient', gradient: ['#ffd76a', '#ff5e7a', '#ff9d00'] },
  neon: { label: 'Neon gradient', gradient: ['#ff2ea6', '#b04dff', '#21d8ff'] },
  gold: { label: 'Gold', gradient: ['#fff3a6', '#ffc233', '#ff8a00'] },
};

export const CAPTION_PAINT_IDS = ['white', 'sunset', 'neon', 'gold'];
