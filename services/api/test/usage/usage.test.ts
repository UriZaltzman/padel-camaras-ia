import { describe, expect, it } from 'vitest';
import {
  MARGIN_ALERT_BPS,
  estimateCostCents,
  marginBps,
  periodBounds,
  periodOf,
  previousPeriod,
} from '../../src/usage/cost';
import {
  InMemorySubscriptionsRepository,
  SubscriptionsService,
} from '../../src/subscriptions/subscriptions.service';
import { PLACEHOLDER_TARIFF, TariffRegistry } from '../../src/subscriptions/tariff';
import {
  InMemoryUsageRepository,
  type ClubMeasures,
  type UsageSourcePort,
} from '../../src/usage/usage.model';
import { UsageService, type MarginAlert } from '../../src/usage/usage.service';

const A = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e01';
const B = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e02';
const GB = 1024 ** 3;
const RATES = {
  centsPerStorageGb: 100,
  centsPerVideoMinute: 10,
  centsPerRecordedMatch: 1_000,
  fixedCents: 0,
};

function setup(measures: Record<string, ClubMeasures>) {
  const subs = new InMemorySubscriptionsRepository();
  for (const id of Object.keys(measures)) {
    subs.subs.set(id, {
      clubId: id,
      tariffVersionId: PLACEHOLDER_TARIFF.id,
      contractStart: new Date('2026-01-01T00:00:00Z'),
      indexByQuarter: [],
    });
  }
  const tariffs = new TariffRegistry([PLACEHOLDER_TARIFF]);
  const source: UsageSourcePort = {
    measure: (clubId) => Promise.resolve(measures[clubId] as ClubMeasures),
  };
  const sent: MarginAlert[] = [];
  const repo = new InMemoryUsageRepository();
  // Active players come from the same measures so the seed numbers are the single truth.
  const subscriptions = new SubscriptionsService(
    subs,
    tariffs,
    {
      countActivePlayers: (id) => Promise.resolve((measures[id] as ClubMeasures).activePlayers90d),
    },
    { notify: () => Promise.resolve() },
  );
  const service = new UsageService(
    source,
    repo,
    subs,
    subscriptions,
    tariffs,
    RATES,
    {
      notify: (a) => {
        sent.push(a);
        return Promise.resolve();
      },
    },
    { nameOf: (id) => Promise.resolve(`club-${id.slice(-2)}`) },
  );
  return { service, repo, sent };
}

const measure = (over: Partial<ClubMeasures> = {}): ClubMeasures => ({
  activePlayers90d: 48,
  bookings: 300,
  recordedMatches: 200,
  storageBytes: 10 * GB,
  videoMinutes: 6_000,
  rowCounts: { bookings: 300 },
  ...over,
});

describe('periods', () => {
  it('uses Buenos Aires months', () => {
    expect(periodOf(new Date('2026-11-01T02:59:00Z'))).toBe('2026-10');
    expect(periodOf(new Date('2026-11-01T03:00:00Z'))).toBe('2026-11');
    expect(previousPeriod('2026-01')).toBe('2025-12');
    expect(periodBounds('2026-10').end.toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });
});

describe('cost and margin', () => {
  it('sums storage, video and matches', () => {
    expect(estimateCostCents(measure(), RATES)).toBe(1_000 + 60_000 + 200_000);
    expect(marginBps(1_000, 400)).toBe(6_000);
    expect(marginBps(0, 400)).toBeNull();
  });
});

describe('daily metering', () => {
  it('stores the measures with tier, next tier and invoiced amount', async () => {
    const { service, repo } = setup({ [A]: measure() });
    await service.runDaily(new Date('2026-10-15T12:00:00Z'));
    const row = await repo.get(A, '2026-10');
    expect(row).toMatchObject({
      activePlayers90d: 48,
      bookings: 300,
      tierName: 'tier-1',
      nextTierAt: 51,
      nearLimit: true,
      invoicedCents: 20_000_00,
    });
  });

  it('alerts only after two consecutive months under 60%', async () => {
    const m = measure({ videoMinutes: 400_000 }); // cost far above the invoice
    const { service, sent } = setup({ [A]: m });
    await service.runDaily(new Date('2026-09-15T12:00:00Z'));
    expect(sent).toHaveLength(0);
    await service.runDaily(new Date('2026-10-15T12:00:00Z'));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ clubId: A, period: '2026-10' });
    expect(sent[0]?.marginsBps.every((b) => b < MARGIN_ALERT_BPS)).toBe(true);
  });

  it('does not alert when a healthy month sits between', async () => {
    const bad = setup({ [A]: measure({ videoMinutes: 400_000 }) });
    await bad.service.runDaily(new Date('2026-08-15T12:00:00Z'));
    await bad.service.runDaily(new Date('2026-10-15T12:00:00Z'));
    expect(bad.sent).toHaveLength(0);
  });

  it('lists the admin rows with trend, paging and near_limit filter', async () => {
    const { service } = setup({ [A]: measure(), [B]: measure({ activePlayers90d: 10 }) });
    await service.runDaily(new Date('2026-09-15T12:00:00Z'));
    const now = new Date('2026-10-15T12:00:00Z');
    await service.runDaily(now);
    const first = await service.listForAdmin({ limit: 1, now });
    expect(first.items[0]).toMatchObject({
      club_id: A,
      club_name: 'club-01',
      trend: [48, 48],
      storage_gb: 10,
    });
    const second = await service.listForAdmin({ limit: 1, cursor: first.next_cursor ?? '', now });
    expect(second.items[0]?.club_id).toBe(B);
    expect(second.next_cursor).toBeNull();
    const near = await service.listForAdmin({ nearLimit: true, now });
    expect(near.items.map((i) => i.club_id)).toEqual([A]);
    await expect(service.listForAdmin({ cursor: 'zzz', now })).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
    });
  });
});
