// Design token reference — mirror of the CSS variables in globals.css.
// Use these in TypeScript when you need a value outside a Tailwind className
// (charts, inline styles, SVG fills, etc.). Update both files together.

export const tokens = {
  // Type scale (px)
  fontSize: {
    xxs: 10,
    xs:  12,
    sm:  14,
    base: 16,
    lg:  18,
  },

  // Spacing — 4px base, Tailwind aligned
  space: {
    1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48,
  },

  // Radii
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },

  // Motion (ms)
  duration: {
    fast: 150,
    base: 200,
    slow: 300,
  },

  // Semantic tones — for Badge/Banner/Button variant maps
  tones: ['brand', 'success', 'warning', 'danger', 'info', 'snooze', 'neutral', 'ai'] as const,
} as const;

export type Tone = typeof tokens.tones[number];
