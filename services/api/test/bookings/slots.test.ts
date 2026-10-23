import { describe, expect, it } from 'vitest';
import type { BookingRule } from '../../src/clubs/club-model';
import { playerHorizonDays } from '../../src/bookings/booking-policy';
import {
  generateSlots,
  localDate,
  localToUtc,
  weekdayOf,
  type SlotInput,
} from '../../src/bookings/slots';

const TZ = 'America/Argentina/Buenos_Aires';

const rule = (over: Partial<BookingRule> = {}): BookingRule => ({
  days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  opens_at: '08:00',
  closes_at: '24:00',
  allowed_durations: [60, 90],
  start_interval_minutes: 30,
  price_bands: [
    {
      starts_at: '08:00',
      ends_at: '18:00',
      prices: [
        { duration_minutes: 60, amount_cents: 1000 },
        { duration_minutes: 90, amount_cents: 1500 },
      ],
    },
    {
      starts_at: '18:00',
      ends_at: '24:00',
      prices: [
        { duration_minutes: 60, amount_cents: 2000 },
        { duration_minutes: 90, amount_cents: 3000 },
      ],
    },
  ],
  ...over,
});

const input = (over: Partial<SlotInput> = {}): SlotInput => ({
  rules: [rule()],
  date: '2026-11-02', // Monday
  timezone: TZ,
  durationMinutes: 90,
  deposit: { type: 'none' },
  occupied: [],
  now: new Date('2026-11-01T12:00:00Z'),
  minNoticeMinutes: 30,
  horizonDays: 14,
  ...over,
});

describe('time helpers', () => {
  it('converts local time in Buenos Aires (UTC-3) to UTC', () => {
    expect(localToUtc('2026-11-02', 18 * 60, TZ).toISOString()).toBe('2026-11-02T21:00:00.000Z');
    expect(localToUtc('2026-11-02', 24 * 60, TZ).toISOString()).toBe('2026-11-03T03:00:00.000Z');
  });
  it('finds the local day of an instant', () => {
    expect(localDate(new Date('2026-11-03T01:30:00Z'), TZ)).toBe('2026-11-02');
  });
  it('gives the ISO weekday', () => {
    expect(weekdayOf('2026-11-02')).toBe('mon');
    expect(weekdayOf('2026-11-08')).toBe('sun');
  });
  it('clamps the player horizon to 1..14 days, default 14', () => {
    expect(playerHorizonDays()).toBe(14);
    expect(playerHorizonDays(0)).toBe(1);
    expect(playerHorizonDays(60)).toBe(14);
    expect(playerHorizonDays(7)).toBe(7);
  });
});

describe('generateSlots', () => {
  it('generates starts every interval and ends by closing time', () => {
    const slots = generateSlots(input());
    expect(slots[0]?.start.toISOString()).toBe('2026-11-02T11:00:00.000Z'); // 08:00 local
    expect(slots.at(-1)?.end.toISOString()).toBe('2026-11-03T03:00:00.000Z'); // 24:00 local
    expect(slots).toHaveLength(((24 - 8) * 60 - 90) / 30 + 1);
  });

  it('prices each slot by the band where it starts', () => {
    const slots = generateSlots(input());
    expect(
      slots.find((s) => s.start.toISOString() === '2026-11-02T20:30:00.000Z')?.amountCents,
    ).toBe(1500); // 17:30
    expect(
      slots.find((s) => s.start.toISOString() === '2026-11-02T21:00:00.000Z')?.amountCents,
    ).toBe(3000); // 18:00
  });

  it('computes the deposit', () => {
    expect(
      generateSlots(input({ deposit: { type: 'percent', percent: 30 } }))[0]?.depositCents,
    ).toBe(450);
    expect(
      generateSlots(input({ deposit: { type: 'fixed', amount_cents: 99999 } }))[0]?.depositCents,
    ).toBe(1500);
  });

  it('drops slots overlapping occupied intervals but keeps back-to-back ones', () => {
    const occupied = [
      { start: new Date('2026-11-02T21:00:00Z'), end: new Date('2026-11-02T22:30:00Z') },
    ];
    const starts = generateSlots(input({ occupied })).map((s) => s.start.toISOString());
    expect(starts).not.toContain('2026-11-02T20:30:00.000Z');
    expect(starts).not.toContain('2026-11-02T21:30:00.000Z');
    expect(starts).toContain('2026-11-02T19:30:00.000Z'); // ends exactly at 21:00
    expect(starts).toContain('2026-11-02T22:30:00.000Z');
  });

  it('applies the minimum notice', () => {
    const now = new Date('2026-11-02T11:00:00Z'); // 08:00 local
    const first = generateSlots(input({ now }))[0];
    expect(first?.start.toISOString()).toBe('2026-11-02T11:30:00.000Z');
  });

  it('clips to the player horizon', () => {
    expect(generateSlots(input({ date: '2026-11-15' }))).not.toHaveLength(0);
    expect(generateSlots(input({ date: '2026-11-16' }))).toHaveLength(0);
    expect(generateSlots(input({ date: '2026-11-16', horizonDays: 365 }))).not.toHaveLength(0);
  });

  it('returns nothing for a weekday without rule or a duration not allowed', () => {
    expect(generateSlots(input({ rules: [rule({ days: ['tue'] })] }))).toEqual([]);
    expect(generateSlots(input({ durationMinutes: 120 }))).toEqual([]);
  });

  it('supports closing after midnight', () => {
    const slots = generateSlots(
      input({ rules: [rule({ opens_at: '20:00', closes_at: '02:00' })], durationMinutes: 60 }),
    );
    expect(slots.at(-1)?.end.toISOString()).toBe('2026-11-03T05:00:00.000Z'); // 02:00 local next day
  });

  it('does not repeat a start when rules overlap', () => {
    const slots = generateSlots(input({ rules: [rule(), rule()] }));
    expect(new Set(slots.map((s) => s.start.getTime())).size).toBe(slots.length);
  });
});
