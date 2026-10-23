import { beforeEach, describe, expect, it } from 'vitest';
import { AvailabilityService } from '../../src/bookings/availability.service';
import { InMemoryBookingIdempotency } from '../../src/bookings/booking-idempotency';
import { BookingsService } from '../../src/bookings/bookings.service';
import type { CourtRules } from '../../src/bookings/bookings.repository';
import { HoldExpiryService } from '../../src/bookings/hold-expiry.service';
import { FakeClock } from '../../src/common/clock';
import type { Env } from '../../src/config/env';
import type { AppError } from '../../src/errors/app-error';
import { FakeBookingsRepository } from './fake-repo';

const COURT = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a61';
const court = (deposit: CourtRules['deposit']): CourtRules => ({
  courtId: COURT,
  clubId: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a62',
  timezone: 'America/Argentina/Buenos_Aires',
  status: 'active',
  deposit,
  cancellationRefundHours: 24,
  playerHorizonDays: 14,
  windowOpensAtMinutes: null,
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      opens_at: '08:00',
      closes_at: '24:00',
      allowed_durations: [60, 90],
      start_interval_minutes: 30,
      price_bands: [
        {
          starts_at: '08:00',
          ends_at: '24:00',
          prices: [
            { duration_minutes: 60, amount_cents: 1000 },
            { duration_minutes: 90, amount_cents: 1500 },
          ],
        },
      ],
    },
  ],
});

const alice = { userId: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a71', sessionId: 's' };
const bob = { userId: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a72', sessionId: 's' };
// 2026-11-02 19:00 local = 22:00 UTC; the clock starts at 2026-11-01T12:00Z.
const body = {
  court_id: COURT,
  starts_at: '2026-11-02T22:00:00.000Z',
  duration_minutes: 90 as const,
};

function setup(deposit: CourtRules['deposit']) {
  const repo = new FakeBookingsRepository(court(deposit));
  const clock = new FakeClock();
  const availability = new AvailabilityService(repo, clock);
  const bookings = new BookingsService(repo, availability, new InMemoryBookingIdempotency(), clock);
  const expiry = new HoldExpiryService(repo, availability, clock, { NODE_ENV: 'test' } as Env);
  return { repo, clock, availability, bookings, expiry };
}

describe('availability cache', () => {
  it('serves 30 s from cache, then refreshes', async () => {
    const { repo, clock, availability } = setup({ type: 'none' });
    await availability.forCourt(COURT, '2026-11-02', 90);
    await availability.forCourt(COURT, '2026-11-02', 90);
    expect(repo.occupiedCalls).toBe(1);
    clock.advanceSeconds(31);
    await availability.forCourt(COURT, '2026-11-02', 90);
    expect(repo.occupiedCalls).toBe(2);
  });

  it('drops a slot right after it is booked in this process', async () => {
    const { bookings, availability } = setup({ type: 'none' });
    const before = await availability.forCourt(COURT, '2026-11-02', 90);
    await bookings.create(alice, body);
    const after = await availability.forCourt(COURT, '2026-11-02', 90);
    expect(before.slots.some((s) => s.starts_at === body.starts_at)).toBe(true);
    expect(after.slots.some((s) => s.starts_at === body.starts_at)).toBe(false);
  });

  it('404s for an unknown court', async () => {
    const { availability } = setup({ type: 'none' });
    await expect(
      availability.forCourt('01928f6e-7c1a-7d4e-9b3a-000000000000', '2026-11-02', 90),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('booking holds', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup({ type: 'percent', percent: 30 });
  });

  it('creates a held booking that expires in 10 minutes', async () => {
    const booking = await ctx.bookings.create(alice, body);
    expect(booking.status).toBe('held');
    expect(booking.deposit_cents).toBe(450);
    expect(new Date(booking.hold_expires_at ?? '').getTime() - ctx.clock.now().getTime()).toBe(
      10 * 60_000,
    );
  });

  it('confirms at once when there is no deposit', async () => {
    const { bookings } = setup({ type: 'none' });
    const booking = await bookings.create(alice, body);
    expect(booking.status).toBe('confirmed');
    expect(booking.hold_expires_at).toBeNull();
  });

  it('answers BOOKING_SLOT_TAKEN to the second person, with details', async () => {
    await ctx.bookings.create(alice, body);
    await expect(ctx.bookings.create(bob, body)).rejects.toMatchObject({
      code: 'BOOKING_SLOT_TAKEN',
      details: { court_id: COURT, starts_at: body.starts_at },
    });
  });

  it('gives exactly one booking out of 1000 simultaneous attempts', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 1000 }, () => ctx.bookings.create(bob, body)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results) {
      if (r.status === 'rejected') expect((r.reason as AppError).code).toBe('BOOKING_SLOT_TAKEN');
    }
    expect(ctx.repo.rows).toHaveLength(1);
  });

  it('rejects slots that break the rules with BOOKING_SLOT_INVALID', async () => {
    await expect(
      ctx.bookings.create(alice, { ...body, starts_at: '2026-11-02T22:10:00.000Z' }),
    ).rejects.toMatchObject({ code: 'BOOKING_SLOT_INVALID' });
    await expect(
      ctx.bookings.create(alice, { ...body, starts_at: '2026-11-01T12:10:00.000Z' }),
    ).rejects.toMatchObject({ code: 'BOOKING_SLOT_INVALID' });
    await expect(
      ctx.bookings.create(alice, { ...body, starts_at: '2026-12-25T22:00:00.000Z' }),
    ).rejects.toMatchObject({ code: 'BOOKING_SLOT_INVALID' });
  });

  it('returns the same booking when the Idempotency-Key repeats', async () => {
    const first = await ctx.bookings.create(alice, body, 'key-12345678');
    const second = await ctx.bookings.create(alice, body, 'key-12345678');
    expect(second.id).toBe(first.id);
    expect(ctx.repo.rows).toHaveLength(1);
  });

  it('frees the slot when the hold expires', async () => {
    await ctx.bookings.create(alice, body);
    ctx.clock.advanceSeconds(10 * 60 + 1);
    // Free even before the job runs...
    const slots = await ctx.availability.forCourt(COURT, '2026-11-02', 90);
    expect(slots.slots.some((s) => s.starts_at === body.starts_at)).toBe(true);
    // ...and the job marks it expired.
    expect(await ctx.expiry.runOnce()).toBe(1);
    expect(ctx.repo.rows[0]?.status).toBe('expired');
    const next = await ctx.bookings.create(bob, body);
    expect(next.status).toBe('held');
  });

  it('keeps a hold that has not expired yet', async () => {
    await ctx.bookings.create(alice, body);
    ctx.clock.advanceSeconds(9 * 60);
    expect(await ctx.expiry.runOnce()).toBe(0);
    expect(ctx.repo.rows[0]?.status).toBe('held');
  });
});
