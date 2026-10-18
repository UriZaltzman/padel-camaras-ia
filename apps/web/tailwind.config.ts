// Tailwind theme built from packages/ui/tokens.ts: no color or font is defined here.
// Loaded from src/app/globals.css with `@config`.
import { color, fontFamily, typography } from '@app/ui/tokens';
import type { Config } from 'tailwindcss';

const em = (value: number) => `${value}em`;

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ...color },
      fontFamily: {
        // `--font-*` come from next/font in src/app/fonts.ts; the token name is the fallback.
        display: ['var(--font-display)', fontFamily.display, 'sans-serif'],
        sans: ['var(--font-body)', fontFamily.body, 'sans-serif'],
        mono: ['var(--font-mono)', fontFamily.mono, 'monospace'],
      },
      letterSpacing: {
        display: em(typography.display.letterSpacingEm),
        label: em(typography.dataLabel.letterSpacingEm),
      },
    },
  },
} satisfies Config;
