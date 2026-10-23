import type { Schema } from '@app/contracts';

export type TariffTier = Schema<'AdminTariffTier'>;
export type ModuleKey = Schema<'AdminModulePrice'>['module'];

export type TierProblem = 'empty' | 'startsAbove0' | 'gap' | 'overlap' | 'openTop' | 'badRange';

/**
 * Same rule the API enforces (`TARIFF_TIERS_INVALID`): bands start at 0, do not overlap or leave
 * gaps, and only the last has no upper limit. Returns the first problem found, or null.
 */
export function validateTiers(tiers: TariffTier[]): TierProblem | null {
  if (tiers.length === 0) return 'empty';
  const sorted = [...tiers].sort((a, b) => a.min_active_players - b.min_active_players);
  if (sorted[0]?.min_active_players !== 0) return 'startsAbove0';
  for (const [i, tier] of sorted.entries()) {
    const last = i === sorted.length - 1;
    if (tier.max_active_players === null) {
      if (!last) return 'openTop';
      continue;
    }
    if (tier.max_active_players < tier.min_active_players) return 'badRange';
    if (last) return 'openTop';
    const next = sorted[i + 1];
    if (!next) return 'openTop';
    if (next.min_active_players <= tier.max_active_players) return 'overlap';
    if (next.min_active_players > tier.max_active_players + 1) return 'gap';
  }
  return null;
}

export function tierFor(tiers: TariffTier[], activePlayers: number): TariffTier | null {
  return (
    tiers.find(
      (t) =>
        activePlayers >= t.min_active_players &&
        (t.max_active_players === null || activePlayers <= t.max_active_players),
    ) ?? null
  );
}

/** Module prices a set of flags switches on (mirrors the API's estimate; used by the mock only). */
export function enabledModules(modules: Schema<'AdminModules'>): ModuleKey[] {
  const keys: ModuleKey[] = [];
  if (modules.deposit.enabled) keys.push('deposit');
  if (modules.branding.mode === 'own') keys.push('branding_own');
  if (modules.lesson_mode === 'app') keys.push('lessons_app');
  if (modules.ai_video === 'club_pays') keys.push('ai_video_club_pays');
  if (modules.ai_video === 'player_pays') keys.push('ai_video_player_pays');
  if (modules.tournaments) keys.push('tournaments');
  return keys;
}

export function simulateInvoice(
  version: Schema<'AdminTariffVersionCreate'>,
  activePlayers: number,
  modules: Schema<'AdminModules'>,
): Schema<'AdminInvoiceSimulation'> | null {
  const tier = tierFor(version.tiers, activePlayers);
  if (!tier) return null;
  const on = enabledModules(modules);
  const modulesCents = version.module_prices
    .filter((p) => on.includes(p.module))
    .reduce((sum, p) => sum + p.monthly_cents, 0);
  return {
    tier: {
      name: `${tier.min_active_players}-${tier.max_active_players ?? '∞'}`,
      min_active_players: tier.min_active_players,
      max_active_players: tier.max_active_players,
    },
    subscription_cents: tier.monthly_cents,
    modules_cents: modulesCents,
    total_cents: tier.monthly_cents + modulesCents,
  };
}
