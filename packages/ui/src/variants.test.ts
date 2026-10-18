import { describe, expect, it } from 'vitest';

import { color } from '../tokens';
import { contrastRatio, relativeLuminance } from './contrast';
import { nativeFontFamily, nativeFontNames, resolveNativeFontFamily } from './fonts';
import {
  buttonVariants,
  cardVariants,
  dataLabelVariants,
  scorePillVariants,
  type VariantColors,
} from './variants';

const AA_TEXT = 4.5;
const groups: Record<string, Record<string, VariantColors>> = {
  button: buttonVariants,
  card: cardVariants,
  dataLabel: dataLabelVariants,
  scorePill: scorePillVariants,
};
const all = Object.entries(groups).flatMap(([g, vs]) =>
  Object.entries(vs).map(([name, v]) => [`${g}.${name}`, v] as const),
);
const darkBackgrounds = [color.night, color.court, color.courtDark] as const;

describe('component variants', () => {
  it.each(all)('%s keeps WCAG AA text contrast on every background', (_, v) => {
    expect(v.backgrounds.length).toBeGreaterThan(0);
    for (const bg of v.backgrounds) {
      expect(contrastRatio(v.foreground, bg)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it.each(all)('%s uses the ball color only on dark backgrounds', (_, v) => {
    if (v.foreground !== color.ball) return;
    for (const bg of v.backgrounds) {
      expect(darkBackgrounds).toContain(bg);
    }
  });

  it('never puts ball text on a light background', () => {
    for (const [, v] of all) {
      if (v.foreground !== color.ball) continue;
      for (const bg of v.backgrounds) expect(relativeLuminance(bg)).toBeLessThan(0.2);
    }
  });

  it('presses the primary button to courtDark', () => {
    expect(buttonVariants.primary.background).toBe(color.court);
    expect(buttonVariants.primary.pressedBackground).toBe(color.courtDark);
  });
});

describe('native font mapping', () => {
  it('maps each brand weight to its own family name', () => {
    expect(resolveNativeFontFamily('mono', 500)).toBe('IBMPlexMono_500Medium');
    expect(resolveNativeFontFamily('display', 900)).toBe('Archivo_900Black');
    expect(resolveNativeFontFamily('body', 600)).toBe('IBMPlexSans_600SemiBold');
    expect(new Set(nativeFontNames).size).toBe(6);
  });

  it('falls back to the closest loaded weight', () => {
    expect(resolveNativeFontFamily('body', 700)).toBe(nativeFontFamily.body[600]);
    expect(resolveNativeFontFamily('mono', 400)).toBe(nativeFontFamily.mono[500]);
  });
});
