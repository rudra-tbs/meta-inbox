import type { Config } from "tailwindcss";

const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",

        canvas:   rgb('--surface-canvas'),
        elevated: rgb('--surface-elevated'),
        muted:    rgb('--surface-muted'),
        warm:     rgb('--surface-warm'),
        inverse:  rgb('--surface-inverse'),

        'border-default': rgb('--border-default'),
        'border-strong':  rgb('--border-strong'),
        'border-subtle':  rgb('--border-subtle'),

        'text-primary':   rgb('--text-primary'),
        'text-default':   rgb('--text-default'),
        'text-secondary': rgb('--text-secondary'),
        'text-muted':     rgb('--text-muted'),
        'text-disabled':  rgb('--text-disabled'),
        'text-inverse':   rgb('--text-inverse'),

        brand: {
          DEFAULT: rgb('--color-brand'),
          hover:   rgb('--color-brand-hover'),
          soft:    rgb('--color-brand-soft'),
          tint:    rgb('--color-brand-tint'),
        },
        success: { DEFAULT: rgb('--color-success'), soft: rgb('--color-success-soft') },
        warning: { DEFAULT: rgb('--color-warning'), soft: rgb('--color-warning-soft') },
        danger:  { DEFAULT: rgb('--color-danger'),  soft: rgb('--color-danger-soft')  },
        info:    { DEFAULT: rgb('--color-info'),    soft: rgb('--color-info-soft')    },
        snooze:  { DEFAULT: rgb('--color-snooze'),  soft: rgb('--color-snooze-soft')  },

        'channel-wa': rgb('--channel-wa'),
        'channel-ig': rgb('--channel-ig'),
      },
    },
  },
  plugins: [],
};
export default config;
