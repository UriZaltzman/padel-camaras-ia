import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/common/clock';
import { accessFor, daysOverdue, stageForDays } from '../../src/subscriptions/dunning';
import { adjustmentsDue, applyIndex, indexedPrice } from '../../src/subscriptions/indexation';
import {
  InMemorySubscriptionsRepository,
  SubscriptionsService,
  type DunningNotifier,
} from '../../src/subscriptions/subscriptions.service';
import {
  PLACEHOLDER_TARIFF,
  TariffRegistry,
  tierFor,
  validateTiers,
  type TariffTier,
  type TariffVersion,
} from '../../src/subscriptions/tariff';
import type { DunningStage } from '../../src/subscriptions/dunning';

const CLUB = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e01';

describe('tariff tiers', () => {
  it('picks the tier by active players, edges included', () => {
    expect(tierFor(PLACEHOLDER_TARIFF, 0).name).toBe('tier-1');
    expect(tierFor(PLACEHOLDER_TARIFF, 50).name).toBe('tier-1');
    expect(tierFor(PLACEHOLDER_TARIFF, 51).name).toBe('tier-2');
    expect(tierFor(PLACEHOLDER_TARIFF, 300).name).toBe('tier-3');
    expect(tierFor(PLACEHOLDER_TARIFF, 301).name).toBe('tier-4');
    expect(tierFor(PLACEHOLDER_TARIFF, 5_000).name).toBe('tier-4');
  });

  it('rejects gaps, overlaps and a closed last tier', () => {
    const [first, ...rest] = PLACEHOLDER_TARIFF.tiers as [TariffTier, ...TariffTier[]];
    const t = [first, ...rest];
    expect(() => validateTiers([{ ...first, maxActivePlayers: 40 }, ...t.slice(1)])).toThrow();
    expect(() => validateTiers([{ ...first, maxActivePlayers: 60 }, ...t.slice(1)])).toThrow();
    expect(() => validateTiers(t.slice(0, 3))).toThrow();
    expect(() => validateTiers([{ ...first, minActivePlayers: 1 }, ...t.slice(1)])).toThrow();
    expect(() => validateTiers(t)).not.toThrow();
  });

  it('keeps versions: the one in force on a date, and never edits a published one', () => {
    const next: TariffVersion = { ...PLACEHOLDER_TARIFF, id: 'v2', effectiveFrom: '2027-01-01' };
    const registry = new TariffRegistry([PLACEHOLDER_TARIFF]);
    registry.publish(next);
    expect(registry.current('2026-12-31').id).toBe(PLACEHOLDER_TARIFF.id);
    expect(registry.current('2027-01-01').id).toBe('v2');
    expect(() => registry.publish(next)).toThrow();
    expect(() => registry.current('2025-01-01')).toThrow();
  });
});

describe('quarterly index', () => {
  const start = new Date('2026-01-15T12:00:00Z');
  it('comes due every 3 months', () => {
    expect(adjustmentsDue(start, new Date('2026-04-14T12:00:00Z'))).toBe(0);
    expect(adjustmentsDue(start, new Date('2026-04-15T12:00:00Z'))).toBe(1);
    expect(adjustmentsDue(start, new Date('2026-10-15T12:00:00Z'))).toBe(3);
  });
  it('compounds in integer cents and skips quarters without a published index', () => {
    expect(applyIndex(100_000, 800)).toBe(108_000);
    expect(indexedPrice(100_000, start, new Date('2026-10-20T00:00:00Z'), [800, 500])).toBe(
      113_400,
    );
    expect(indexedPrice(100_000, start, new Date('2026-04-20T00:00:00Z'), [])).toBe(100_000);
  });
});

describe('dunning cutoffs', () => {
  it('maps days overdue to the stage (+1 notice, +7 banner, +15 restricted, +30 suspended)', () => {
    expect(stageForDays(0)).toBe('current');
    expect(stageForDays(1)).toBe('notice');
    expect(stageForDays(6)).toBe('notice');
    expect(stageForDays(7)).toBe('banner');
    expect(stageForDays(14)).toBe('banner');
    expect(stageForDays(15)).toBe('restricted');
    expect(stageForDays(29)).toBe('restricted');
    expect(stageForDays(30)).toBe('suspended');
  });
  it('counts local Buenos Aires days, not 24 hour blocks', () => {
    // 22:00 local (01:00Z next day) to 00:30 local is already one day later.
    expect(daysOverdue(new Date('2026-11-01T01:00:00Z'), new Date('2026-11-01T03:30:00Z'))).toBe(1);
    expect(daysOverdue(new Date('2026-11-01T15:00:00Z'), new Date('2026-11-01T23:00:00Z'))).toBe(0);
  });
  it('restricts bookings at 15 days and cuts recording at 30', () => {
    expect(accessFor('banner')).toMatchObject({ showDebtBanner: true, canCreateBookings: true });
    expect(accessFor('restricted')).toMatchObject({ canCreateBookings: false, canRecord: true });
    expect(accessFor('suspended')).toMatchObject({ canRecord: false });
  });
});

describe('SubscriptionsService with a simulated clock', () => {
  function setup(activePlayers = 120) {
    const repository = new InMemorySubscriptionsRepository();
    repository.subs.set(CLUB, {
      clubId: CLUB,
      tariffVersionId: PLACEHOLDER_TARIFF.id,
      contractStart: new Date('2026-11-01T12:00:00Z'),
      indexByQuarter: [1_000],
    });
    const sent: { stage: DunningStage; days: number }[] = [];
    const notifier: DunningNotifier = {
      notify: (_c, stage, days) => {
        sent.push({ stage, days });
        return Promise.resolve();
      },
    };
    const clock = new FakeClock(new Date('2026-11-01T12:00:00Z'));
    const service = new SubscriptionsService(
      repository,
      new TariffRegistry([PLACEHOLDER_TARIFF]),
      { countActivePlayers: () => Promise.resolve(activePlayers) },
      notifier,
    );
    return { repository, service, clock, sent };
  }
  const day = 24 * 60 * 60;

  it('prices base + tier of the active players', async () => {
    const { service, clock } = setup(120);
    const invoice = await service.quoteFor(CLUB, clock.now());
    expect(invoice.tier.name).toBe('tier-2');
    expect(invoice.amountCents).toBe(PLACEHOLDER_TARIFF.baseCents + 20_000_00);
  });

  it('applies the index from the first quarter on', async () => {
    const { service, clock } = setup(10);
    clock.advanceSeconds(92 * day);
    const invoice = await service.quoteFor(CLUB, clock.now());
    expect(invoice.amountCents).toBe(Math.round(invoice.listCents * 1.1));
  });

  it('walks notice, banner, restricted and suspended on days 1, 7, 15 and 30', async () => {
    const { service, repository, clock, sent } = setup();
    await service.openCharge(CLUB, 'c1', clock.now(), clock.now(), clock.now());

    expect(await service.runDunning(clock.now())).toEqual([]);
    let elapsed = 0;
    for (const [days, stage] of [
      [1, 'notice'],
      [7, 'banner'],
      [15, 'restricted'],
      [30, 'suspended'],
    ] as const) {
      clock.advanceSeconds((days - elapsed) * day);
      elapsed = days;
      expect(await service.stageOf(CLUB, clock.now())).toBe(stage);
      expect((await service.runDunning(clock.now())).map((w) => w.stage)).toEqual([stage]);
    }
    expect(sent.map((s) => s.stage)).toEqual(['notice', 'banner', 'restricted', 'suspended']);
    expect(sent.map((s) => s.days)).toEqual([1, 7, 15, 30]);
    expect(await service.runDunning(clock.now())).toEqual([]);
    await expect(service.assertCanRecord(CLUB, clock.now())).rejects.toMatchObject({
      code: 'CLUB_SERVICE_SUSPENDED',
    });
    expect(repository.charges.get('c1')?.notifiedStage).toBe('suspended');
  });

  it('keeps recording at day 29 and cuts it at day 30', async () => {
    const { service, clock } = setup();
    await service.openCharge(CLUB, 'c1', clock.now(), clock.now(), clock.now());
    clock.advanceSeconds(29 * day);
    await expect(service.assertCanRecord(CLUB, clock.now())).resolves.toBeUndefined();
    expect((await service.accessOf(CLUB, clock.now())).canCreateBookings).toBe(false);
    clock.advanceSeconds(day);
    await expect(service.assertCanRecord(CLUB, clock.now())).rejects.toThrow();
  });

  it('restores the service as soon as the charge is paid', async () => {
    const { service, clock } = setup();
    await service.openCharge(CLUB, 'c1', clock.now(), clock.now(), clock.now());
    clock.advanceSeconds(31 * day);
    await service.markPaid('c1', CLUB, clock.now());
    expect(await service.stageOf(CLUB, clock.now())).toBe('current');
    await expect(service.assertCanRecord(CLUB, clock.now())).resolves.toBeUndefined();
  });
});
