// Platform-neutral component variants: colors, spacing and type per variant, built only from
// tokens. The web (React DOM) and native (React Native) renderers read these and only translate
// units, so both platforms share one source of truth for the look and its contrast guarantees.
import { color } from '../tokens';
import type { FontRole } from './fonts';

export interface TextStyleSpec {
  role: FontRole;
  weight: number;
  fontSize: number;
  letterSpacingEm: number;
  uppercase: boolean;
}

/** Text color of a variant and every background it may sit on (checked for WCAG AA). */
export interface VariantColors {
  foreground: string;
  backgrounds: readonly string[];
}

export const buttonVariants = {
  primary: {
    foreground: color.white,
    background: color.court,
    pressedBackground: color.courtDark,
    border: color.court,
    backgrounds: [color.court, color.courtDark],
  },
  secondary: {
    foreground: color.court,
    background: color.white,
    pressedBackground: color.glass,
    border: color.line,
    backgrounds: [color.white, color.glass],
  },
  // Ball accent: only for buttons placed on dark (night/court) surfaces.
  accent: {
    foreground: color.night,
    background: color.ball,
    pressedBackground: color.ball,
    border: color.ball,
    backgrounds: [color.ball],
  },
} as const satisfies Record<string, VariantColors & Record<string, unknown>>;
export type ButtonVariant = keyof typeof buttonVariants;

export const buttonLayout = {
  borderRadius: 12,
  borderWidth: 1,
  paddingVertical: 12,
  paddingHorizontal: 20,
  minHeight: 44, // touch target
  text: { role: 'body', weight: 600, fontSize: 16, letterSpacingEm: 0, uppercase: false },
} as const satisfies { text: TextStyleSpec } & Record<string, unknown>;

export const cardVariants = {
  light: {
    background: color.white,
    border: color.line,
    foreground: color.night,
    backgrounds: [color.white],
  },
  dark: {
    background: color.night,
    border: color.ink3,
    foreground: color.white,
    backgrounds: [color.night],
  },
  court: {
    background: color.courtDark,
    border: color.courtDark,
    foreground: color.white,
    backgrounds: [color.courtDark],
  },
} as const satisfies Record<string, VariantColors & Record<string, unknown>>;
export type CardVariant = keyof typeof cardVariants;

export const cardLayout = { borderRadius: 16, borderWidth: 1, padding: 16 } as const;

export const dataLabelVariants = {
  default: { foreground: color.ink3, backgrounds: [color.glass, color.white] },
  onPrimary: { foreground: color.white, backgrounds: [color.court, color.courtDark] },
  onDark: { foreground: color.ball, backgrounds: [color.night, color.court, color.courtDark] },
} as const satisfies Record<string, VariantColors>;
export type DataLabelVariant = keyof typeof dataLabelVariants;

export const dataLabelText = {
  role: 'mono',
  weight: 500,
  fontSize: 12,
  letterSpacingEm: 0.12,
  uppercase: true,
} as const satisfies TextStyleSpec;

export const scorePillVariants = {
  // White pill (reels, light screens), night score.
  light: {
    foreground: color.night,
    background: color.white,
    border: color.line,
    backgrounds: [color.white],
  },
  // Night pill, ball score (camera mode).
  dark: {
    foreground: color.ball,
    background: color.night,
    border: color.night,
    backgrounds: [color.night],
  },
} as const satisfies Record<string, VariantColors & Record<string, unknown>>;
export type ScorePillVariant = keyof typeof scorePillVariants;

export const scorePillLayout = {
  borderRadius: 999,
  borderWidth: 1,
  paddingVertical: 6,
  paddingHorizontal: 14,
  text: { role: 'display', weight: 900, fontSize: 20, letterSpacingEm: -0.02, uppercase: false },
} as const satisfies { text: TextStyleSpec } & Record<string, unknown>;
