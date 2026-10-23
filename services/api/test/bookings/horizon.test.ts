import { describe, expect, it } from 'vitest';
import { AvailabilityService } from '../../src/bookings/availability.service';
import { horizonFor } from '../../src/bookings/booking-policy';
import type { CourtRules } from '../../src/bookings/bookings.repository';
import { lastBookableDate } from '../../src/bookings/slots';
import { FakeClock } from '../../src/common/clock';
import { FakeBookingsRepository } from './fake-repo';

const TZ = 'America/Argentina/Buenos_Aires';
const COURT = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a61';
// Clock: 2026-11-01T12:00Z = 09:00 local.
const court = (over: Partial<CourtRules> = {}): CourtRules => ({
  courtId: COURT,
  clubId: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a62',
  timezone: TZ,
  status: 'active',
  deposit: { type: 'none' },
  cancellationRefundHours: 24,
  playerHorizonDays: 14,
  windowOpensAtMinutes: null,
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      opens_at: '08:00',
      closes_at: '24:00',
      allowed_durations: [60],
      start_interval_minutes: 60,
      price_bands: [
        {
          starts_at: '08:00',
          ends_at: '24:00',
          prices: [{ duration_minutes: 60, amount_cents: 1 }],
        },
      ],
    },
  ],
  ...over,
});

const service = (c: CourtRules) =>
  new AvailabilityService(new FakeBookingsRepository(c), new FakeClock());

describe('booking horizon', () => {
  it('a player cannot see or book 15 days ahead, the 14th day is fine', async () => {
    const c = court();
    expect((await service(c).slotsFor(c, '2026-11-15', 60)).length).toBeGreaterThan(0);
    expect(await service(c).slotsFor(c, '2026-11-16', 60)).toHaveLength(0);
  });

  it('staff can book 300 days ahead but not beyond 365', async () => {
    const c = court();
    const staff = { audience: 'staff' as const };
    expect((await service(c).slotsFor(c, '2027-08-28', 60, staff)).length).toBeGreaterThan(0);
    expect(await service(c).slotsFor(c, '2027-11-02', 60, staff)).toHaveLength(0);
  });

  it('a horizon change applies to the next request without a deploy', async () => {
    const c = court({ playerHorizonDays: 7 });
    const s = service(c);
    expect(await s.slotsFor(c, '2026-11-09', 60)).toHaveLength(0);
    c.playerHorizonDays = 10;
    expect((await s.slotsFor(c, '2026-11-09', 60)).length).toBeGreaterThan(0);
  });

  it('the farthest day opens at the configured hour', () => {
    const before = new Date('2026-11-01T12:00:00Z'); // 09:00 local
    expect(lastBookableDate(before, TZ, 14, 10 * 60)).toBe('2026-11-14');
    expect(lastBookableDate(before, TZ, 14, 9 * 60)).toBe('2026-11-15');
    expect(lastBookableDate(before, TZ, 14, null)).toBe('2026-11-15');
  });

  it('uses the local day, not a rolling 14x24h window', () => {
    const lateNight = new Date('2026-11-02T01:30:00Z'); // 22:30 on 11-01 local
    expect(lastBookableDate(lateNight, TZ, 14)).toBe('2026-11-15');
  });

  it('keeps the minimum notice for players', async () => {
    const c = court();
    const slots = await service(c).slotsFor(c, '2026-11-01', 60);
    expect(slots[0]?.start.toISOString()).toBe('2026-11-01T13:00:00.000Z'); // 10:00, >= 09:30
  });

  it('horizonFor is 365 for staff and the clamped club setting for players', () => {
    expect(horizonFor('staff', 3)).toBe(365);
    expect(horizonFor('player', 3)).toBe(3);
    expect(horizonFor('player', 99)).toBe(14);
  });
});
