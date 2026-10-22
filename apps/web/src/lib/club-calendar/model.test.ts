import type { Schema } from '@app/contracts';
import { describe, expect, it } from 'vitest';

import { demoClub } from '@/lib/api/mock-data';

import { addDays, bookingState, bookingsOn, hourRange, visibleRange, weekStart } from './model';

const base = {
  price_cents: 2_000_000,
  deposit_paid_cents: 0,
  source: 'app',
  status: 'confirmed',
  starts_at: '2026-10-21T22:00:00Z',
  ends_at: '2026-10-21T23:30:00Z',
  court_id: 'c1',
} as unknown as Schema<'ClubBooking'>;

describe('club calendar model', () => {
  it('asks for local days in UTC', () => {
    expect(visibleRange('2026-10-21', 'day')).toEqual({
      from: '2026-10-21T03:00:00.000Z',
      to: '2026-10-22T03:00:00.000Z',
    });
    expect(visibleRange('2026-10-21', 'week').from).toBe('2026-10-19T03:00:00.000Z');
  });

  it('starts weeks on Monday', () => {
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('classifies bookings', () => {
    expect(bookingState(base)).toBe('deposit');
    expect(bookingState({ ...base, deposit_paid_cents: 2_000_000 })).toBe('paid');
    expect(bookingState({ ...base, source: 'panel' })).toBe('manual');
    expect(bookingState({ ...base, status: 'cancelled' })).toBeNull();
  });

  it('keeps bookings that overlap the day and court', () => {
    expect(bookingsOn([base], '2026-10-21', 'c1')).toHaveLength(1);
    expect(bookingsOn([base], '2026-10-22', 'c1')).toHaveLength(0);
    expect(bookingsOn([base], '2026-10-21', 'c2')).toHaveLength(0);
  });

  it('derives hours from the rules', () => {
    expect(hourRange(demoClub.courts)).toEqual({ start: 8, end: 24 });
    expect(hourRange([])).toEqual({ start: 8, end: 24 });
  });
});
