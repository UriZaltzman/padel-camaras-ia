import { describe, expect, it } from 'vitest';
import { color, theme } from '../tokens';
import { contrastRatio } from './contrast';

const AA_TEXT = 4.5;

describe('brand tokens', () => {
  it('keeps every theme text pair at WCAG AA', () => {
    for (const t of Object.values(theme)) {
      expect(contrastRatio(t.text, t.background)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(t.text, t.surface)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(t.onPrimary, t.primary)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('only allows the ball accent on dark backgrounds', () => {
    expect(contrastRatio(color.ball, color.night)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(color.ball, color.glass)).toBeLessThan(AA_TEXT);
  });
});
