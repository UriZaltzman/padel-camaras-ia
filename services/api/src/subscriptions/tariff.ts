import { AppError } from '../errors/app-error';

export interface TariffTier {
  name: string;
  minActivePlayers: number;
  /** `null` for the top tier. */
  maxActivePlayers: number | null;
  monthlyCents: number;
}

/**
 * A published price list (decision #253): a fixed base plus one tier chosen by the club's active
 * players. Versions are immutable once published; a new price is a new version.
 */
export interface TariffVersion {
  id: string;
  name: string;
  /** First day (UTC date, `YYYY-MM-DD`) the version can be assigned to a club. */
  effectiveFrom: string;
  baseCents: number;
  tiers: readonly TariffTier[];
}

/** Throws `TARIFF_TIERS_INVALID` on gaps, overlaps, a first tier not at 0 or a closed last tier. */
export function validateTiers(tiers: readonly TariffTier[]): void {
  const invalid = (reason: string): never => {
    throw new AppError('TARIFF_TIERS_INVALID', { reason });
  };
  if (tiers.length === 0) invalid('empty');
  const sorted = [...tiers].sort((a, b) => a.minActivePlayers - b.minActivePlayers);
  if (sorted[0]?.minActivePlayers !== 0) invalid('must_start_at_zero');
  sorted.forEach((tier, i) => {
    if (tier.monthlyCents < 0 || !Number.isInteger(tier.monthlyCents)) invalid('bad_amount');
    const next = sorted[i + 1];
    if (tier.maxActivePlayers === null) {
      if (next) invalid('open_tier_not_last');
      return;
    }
    if (tier.maxActivePlayers < tier.minActivePlayers) invalid('max_below_min');
    if (!next) invalid('last_must_be_open');
    else if (next.minActivePlayers !== tier.maxActivePlayers + 1) invalid('gap_or_overlap');
  });
}

export function tierFor(version: TariffVersion, activePlayers: number): TariffTier {
  const tier = version.tiers.find(
    (t) =>
      activePlayers >= t.minActivePlayers &&
      (t.maxActivePlayers === null || activePlayers <= t.maxActivePlayers),
  );
  if (!tier) throw new AppError('TARIFF_TIERS_INVALID', { reason: 'no_tier' });
  return tier;
}

export interface PriceQuote {
  tier: TariffTier;
  baseCents: number;
  /** base + tier, before the quarterly index. */
  listCents: number;
}

export function quote(version: TariffVersion, activePlayers: number): PriceQuote {
  const tier = tierFor(version, activePlayers);
  return { tier, baseCents: version.baseCents, listCents: version.baseCents + tier.monthlyCents };
}

/** Versions are append-only; the one in force on a date is the latest already effective. */
export class TariffRegistry {
  private readonly versions: TariffVersion[] = [];

  constructor(initial: readonly TariffVersion[] = []) {
    initial.forEach((v) => this.publish(v));
  }

  publish(version: TariffVersion): void {
    validateTiers(version.tiers);
    if (this.versions.some((v) => v.id === version.id)) {
      throw new AppError('VALIDATION_FAILED', { reason: 'version_exists' });
    }
    this.versions.push(version);
    this.versions.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }

  byId(id: string): TariffVersion {
    const found = this.versions.find((v) => v.id === id);
    if (!found) throw new AppError('TARIFF_VERSION_NOT_FOUND');
    return found;
  }

  /** Version in force on `date` (UTC `YYYY-MM-DD`). */
  current(date: string): TariffVersion {
    const found = [...this.versions].reverse().find((v) => v.effectiveFrom <= date);
    if (!found) throw new AppError('TARIFF_VERSION_NOT_FOUND');
    return found;
  }
}

/**
 * PLACEHOLDER amounts so the system runs end to end. They are NOT prices: the real base and
 * tier amounts are decided by the owner and published as a new version (docs/pendientes.md,
 * `TODO_COTIZAR`). Never show these to a club.
 */
export const PLACEHOLDER_TARIFF: TariffVersion = {
  id: '00000000-0000-7000-8000-000000000001',
  name: 'placeholder-v1',
  effectiveFrom: '2026-01-01',
  baseCents: 10_000_00,
  tiers: [
    { name: 'tier-1', minActivePlayers: 0, maxActivePlayers: 50, monthlyCents: 10_000_00 },
    { name: 'tier-2', minActivePlayers: 51, maxActivePlayers: 150, monthlyCents: 20_000_00 },
    { name: 'tier-3', minActivePlayers: 151, maxActivePlayers: 300, monthlyCents: 30_000_00 },
    { name: 'tier-4', minActivePlayers: 301, maxActivePlayers: null, monthlyCents: 40_000_00 },
  ],
};
