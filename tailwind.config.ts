import type { Config } from "tailwindcss";

// Helper for var() colors that support /<alpha-value>
const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Legacy
        background: "var(--background)",
        foreground: "var(--foreground)",

        // Surfaces
        canvas:   rgb('--surface-canvas'),
        elevated: rgb('--surface-elevated'),
        muted:    rgb('--surface-muted'),
        warm:     rgb('--surface-warm'),

        // Borders (custom names so they don't collide with Tailwind defaults)
        'border-default': rgb('--border-default'),
        'border-strong':  rgb('--border-strong'),

        // Text
        'text-primary':   rgb('--text-primary'),
        'text-secondary': rgb('--text-secondary'),
        'text-muted':     rgb('--text-muted'),
        'text-disabled':  rgb('--text-disabled'),
        'text-inverse':   rgb('--text-inverse'),

        // Semantic — full scale (token + soft variant)
        brand: {
          DEFAULT: rgb('--color-brand'),
          hover:   rgb('--color-brand-hover'),
          soft:    rgb('--color-brand-soft'),
        },
        success: {
          DEFAULT: rgb('--color-success'),
          soft:    rgb('--color-success-soft'),
        },
        warning: {
          DEFAULT: rgb('--color-warning'),
          soft:    rgb('--color-warning-soft'),
        },
        danger: {
          DEFAULT: rgb('--color-danger'),
          soft:    rgb('--color-danger-soft'),
        },
        info: {
          DEFAULT: rgb('--color-info'),
          soft:    rgb('--color-info-soft'),
        },
        snooze: {
          DEFAULT: rgb('--color-snooze'),
          soft:    rgb('--color-snooze-soft'),
        },

        // Channel
        'channel-wa': rgb('--channel-wa'),
        'channel-ig': rgb('--channel-ig'),
      },
    },
  },
  plugins: [],
};
export default config;
