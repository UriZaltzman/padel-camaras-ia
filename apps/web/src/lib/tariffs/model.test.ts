import { describe, expect, it } from 'vitest';

import { tierFor, validateTiers, type TariffTier } from './model';

const t = (min: number, max: number | null): TariffTier => ({
  min_active_players: min,
  max_active_players: max,
  monthly_cents: 1,
});

describe('validateTiers', () => {
  it('accepts contiguous bands with an open top', () => {
    expect(validateTiers([t(0, 100), t(101, 400), t(401, null)])).toBeNull();
  });
  it.each([
    ['empty', []],
    ['startsAbove0', [t(5, null)]],
    ['gap', [t(0, 100), t(150, null)]],
    ['overlap', [t(0, 100), t(100, null)]],
    ['openTop', [t(0, 100)]],
    ['openTop', [t(0, null), t(10, null)]],
    ['badRange', [t(0, 100), t(101, 50), t(200, null)]],
  ] as [string, TariffTier[]][])('rejects %s', (problem, tiers) => {
    expect(validateTiers(tiers)).toBe(problem);
  });
});

describe('tierFor', () => {
  const tiers = [t(0, 100), t(101, 1000), t(1001, null)];
  it('finds the band of 900 players', () => {
    expect(tierFor(tiers, 900)?.min_active_players).toBe(101);
  });
  it('finds the open top band', () => {
    expect(tierFor(tiers, 5000)?.min_active_players).toBe(1001);
  });
});
