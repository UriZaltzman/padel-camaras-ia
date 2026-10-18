// Font families per platform. The web loads each family once with all its weights (next/font),
// so it uses the family name plus `fontWeight`. React Native (expo-font) registers one family
// name per weight, so native styles pick the per-weight name and omit `fontWeight`.
import { fontFamily } from '../tokens';

export type FontRole = keyof typeof fontFamily;

export const nativeFontFamily = {
  display: { 800: 'Archivo_800ExtraBold', 900: 'Archivo_900Black' },
  body: {
    400: 'IBMPlexSans_400Regular',
    500: 'IBMPlexSans_500Medium',
    600: 'IBMPlexSans_600SemiBold',
  },
  mono: { 500: 'IBMPlexMono_500Medium' },
} as const satisfies Record<FontRole, Record<number, string>>;

/** Every per-weight family name the app must register with expo-font. */
export const nativeFontNames: readonly string[] = Object.values(nativeFontFamily).flatMap((w) =>
  Object.values(w),
);

/** Per-weight native family; falls back to the closest loaded weight of that role. */
export function resolveNativeFontFamily(role: FontRole, weight: number): string {
  const weights: Record<number, string> = nativeFontFamily[role];
  const exact = weights[weight];
  if (exact) return exact;
  const closest = Object.keys(weights)
    .map(Number)
    .sort((a, b) => Math.abs(a - weight) - Math.abs(b - weight))[0];
  return (closest !== undefined && weights[closest]) || fontFamily[role];
}

const webFallback: Record<FontRole, string> = {
  display: 'system-ui, sans-serif',
  body: 'system-ui, sans-serif',
  mono: 'ui-monospace, monospace',
};

/** CSS font-family stack for the web. */
export function webFontFamily(role: FontRole): string {
  return `'${fontFamily[role]}', ${webFallback[role]}`;
}
