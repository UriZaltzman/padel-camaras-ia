import { AppError } from '../errors/app-error';
import type {
  SubscriptionsRepository,
  SubscriptionsService,
} from '../subscriptions/subscriptions.service';
import type { TariffRegistry } from '../subscriptions/tariff';
import {
  MARGIN_ALERT_BPS,
  MARGIN_ALERT_MONTHS,
  NEAR_LIMIT_RATIO,
  estimateCostCents,
  marginBps,
  periodBounds,
  periodOf,
  previousPeriod,
  storageGb,
  type CostRates,
} from './cost';
import type { UsageRepository, UsageSnapshot, UsageSourcePort } from './usage.model';

export interface MarginAlert {
  clubId: string;
  period: string;
  /** Margins (bps) of the consecutive months below the threshold, oldest first. */
  marginsBps: number[];
}

export interface MarginAlertNotifier {
  notify(alert: MarginAlert): Promise<void>;
}

/** Shape of `AdminUsageRow` in the /admin contract (#292). */
export interface AdminUsageRow {
  club_id: string;
  club_name: string;
  period: string;
  tier_usage: {
    active_players_90d: number;
    tier: { name: string; min_active_players: number; max_active_players: number | null };
    next_tier_at: number | null;
  };
  bookings: number;
  recorded_matches: number;
  storage_gb: number;
  video_minutes: number;
  estimated_cost_cents: number;
  invoiced_cents: number;
  near_limit: boolean;
  trend: number[];
}

export interface ClubNames {
  nameOf(clubId: string): Promise<string>;
}

/** Daily metering: measures each club, prices it against its tier and flags thin margins. */
export class UsageService {
  constructor(
    private readonly source: UsageSourcePort,
    private readonly repository: UsageRepository,
    private readonly subscriptionsRepo: SubscriptionsRepository,
    private readonly subscriptions: SubscriptionsService,
    private readonly tariffs: TariffRegistry,
    private readonly rates: CostRates,
    private readonly notifier: MarginAlertNotifier,
    private readonly names: ClubNames,
  ) {}

  /** Idempotent: re-running the same day overwrites the month's row for each club. */
  async runDaily(now: Date): Promise<MarginAlert[]> {
    const period = periodOf(now);
    const { start, end } = periodBounds(period);
    const alerts: MarginAlert[] = [];
    for (const sub of await this.subscriptionsRepo.subscriptions()) {
      const measures = await this.source.measure(sub.clubId, start, end, now);
      const invoice = await this.subscriptions.quoteFor(sub.clubId, now);
      const version = this.tariffs.byId(sub.tariffVersionId);
      const sorted = [...version.tiers].sort((a, b) => a.minActivePlayers - b.minActivePlayers);
      const next = sorted.find((t) => t.minActivePlayers > invoice.tier.minActivePlayers);
      const nextTierAt = next?.minActivePlayers ?? null;
      const estimated = estimateCostCents(measures, this.rates);
      const snapshot: UsageSnapshot = {
        ...measures,
        activePlayers90d: invoice.activePlayers,
        clubId: sub.clubId,
        period,
        tierName: invoice.tier.name,
        tierMinActivePlayers: invoice.tier.minActivePlayers,
        tierMaxActivePlayers: invoice.tier.maxActivePlayers,
        nextTierAt,
        estimatedCostCents: estimated,
        invoicedCents: invoice.amountCents,
        marginBps: marginBps(invoice.amountCents, estimated),
        nearLimit:
          nextTierAt !== null &&
          nextTierAt - invoice.activePlayers <= Math.ceil(nextTierAt * NEAR_LIMIT_RATIO),
        measuredAt: now,
      };
      await this.repository.save(snapshot);
      const alert = await this.marginAlert(sub.clubId, period);
      if (alert) {
        await this.notifier.notify(alert);
        alerts.push(alert);
      }
    }
    return alerts;
  }

  /** Margin under the threshold in each of the last N months (consecutive, all measured). */
  async marginAlert(clubId: string, period: string): Promise<MarginAlert | null> {
    const margins: number[] = [];
    let p = period;
    for (let i = 0; i < MARGIN_ALERT_MONTHS; i++) {
      const row = await this.repository.get(clubId, p);
      if (!row || row.marginBps === null || row.marginBps >= MARGIN_ALERT_BPS) return null;
      margins.unshift(row.marginBps);
      p = previousPeriod(p);
    }
    return { clubId, period, marginsBps: margins };
  }

  /** `GET /admin/usage`: one page, cursor = offset of the last row seen. */
  async listForAdmin(query: {
    period?: string;
    nearLimit?: boolean;
    cursor?: string;
    limit?: number;
    now: Date;
  }): Promise<{ items: AdminUsageRow[]; next_cursor: string | null }> {
    const period = query.period ?? periodOf(query.now);
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = decodeCursor(query.cursor);
    let rows = await this.repository.byPeriod(period);
    if (query.nearLimit) rows = rows.filter((r) => r.nearLimit);
    const page = rows.slice(offset, offset + limit);
    const items: AdminUsageRow[] = [];
    for (const r of page) {
      const history = await this.repository.history(r.clubId, period, 12);
      items.push({
        club_id: r.clubId,
        club_name: await this.names.nameOf(r.clubId),
        period,
        tier_usage: {
          active_players_90d: r.activePlayers90d,
          tier: {
            name: r.tierName,
            min_active_players: r.tierMinActivePlayers,
            max_active_players: r.tierMaxActivePlayers,
          },
          next_tier_at: r.nextTierAt,
        },
        bookings: r.bookings,
        recorded_matches: r.recordedMatches,
        storage_gb: storageGb(r.storageBytes),
        video_minutes: r.videoMinutes,
        estimated_cost_cents: r.estimatedCostCents,
        invoiced_cents: r.invoicedCents,
        near_limit: r.nearLimit,
        trend: history.map((h) => h.activePlayers90d),
      });
    }
    const end = offset + limit;
    return { items, next_cursor: end < rows.length ? encodeCursor(end) : null };
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(`o:${offset}`).toString('base64url');
}

function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const match = /^o:(\d+)$/.exec(Buffer.from(cursor, 'base64url').toString());
  if (!match) throw new AppError('INVALID_CURSOR');
  return Number(match[1]);
}
