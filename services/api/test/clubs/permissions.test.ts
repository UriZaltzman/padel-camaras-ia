import { describe, expect, it } from 'vitest';
import { assertSettingsValid, findSettingsIssues } from '../../src/clubs/club-settings';
import type {
  BookingRule,
  ClubSettingsUpdate,
  DurationPrice,
  PriceBand,
} from '../../src/clubs/club-model';
import { can, strongestRole } from '../../src/clubs/permissions';

describe('permissions by role (spec section 12)', () => {
  it('only the owner configures the club, sees revenue and manages members', () => {
    for (const permission of [
      'club.update_settings',
      'club.read_revenue',
      'club.manage_members',
    ] as const) {
      expect(can('owner', permission)).toBe(true);
      expect(can('staff', permission)).toBe(false);
      expect(can('coach', permission)).toBe(false);
      expect(can('player', permission)).toBe(false);
    }
  });

  it('staff operates the club (bookings, cameras, recording) but does not see revenue', () => {
    expect(can('staff', 'club.operate')).toBe(true);
    expect(can('staff', 'club.read_revenue')).toBe(false);
    expect(can('coach', 'club.operate')).toBe(false);
    expect(can('player', 'club.operate')).toBe(false);
  });

  it('picks the strongest role', () => {
    expect(strongestRole(['player', 'coach'])).toBe('coach');
    expect(strongestRole(['player', 'owner', 'staff'])).toBe('owner');
    expect(strongestRole([])).toBeNull();
  });
});

const rule = (overrides: Partial<BookingRule> = {}): BookingRule => ({
  days: ['mon', 'tue'],
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
  ...overrides,
});
const [DAY, NIGHT] = rule().price_bands as [PriceBand, PriceBand];
const withRules = (...rules: BookingRule[]): ClubSettingsUpdate => ({
  courts: [
    {
      court_id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a61',
      booking: { rules, deposit: { type: 'none' }, cancellation_refund_hours: 24 },
    },
  ],
});

describe('settings that are valid one by one but not together', () => {
  it('accepts consistent rules', () => {
    expect(findSettingsIssues(withRules(rule()))).toEqual([]);
    expect(() => assertSettingsValid(withRules(rule(), rule({ days: ['sat'] })))).not.toThrow();
  });

  it('flags a gap between price bands', () => {
    const gap = rule({
      price_bands: [
        { starts_at: '08:00', ends_at: '17:00', prices: DAY.prices },
        { starts_at: '18:00', ends_at: '24:00', prices: NIGHT.prices },
      ],
    });
    expect(findSettingsIssues(withRules(gap))).toContainEqual({
      path: '/courts/0/booking/rules/0/price_bands',
      rule: 'gap',
    });
  });

  it('flags bands that stop before closing or overlap', () => {
    const short = rule({ price_bands: [DAY] });
    expect(findSettingsIssues(withRules(short)).map((i) => i.rule)).toContain('gap');
    const overlap = rule({
      price_bands: [
        { starts_at: '08:00', ends_at: '19:00', prices: DAY.prices },
        { starts_at: '18:00', ends_at: '24:00', prices: NIGHT.prices },
      ],
    });
    expect(findSettingsIssues(withRules(overlap)).map((i) => i.rule)).toContain('overlap');
  });

  it('flags a band missing the price of an allowed duration', () => {
    const missing = rule({
      price_bands: [
        { starts_at: '08:00', ends_at: '18:00', prices: [DAY.prices[0] as DurationPrice] },
        NIGHT,
      ],
    });
    expect(findSettingsIssues(withRules(missing))).toContainEqual({
      path: '/courts/0/booking/rules/0/price_bands/0/prices',
      rule: 'durations',
    });
  });

  it('flags rules that overlap on a shared weekday, and accepts the same hours on other days', () => {
    expect(findSettingsIssues(withRules(rule(), rule({ days: ['tue', 'wed'] })))).toContainEqual({
      path: '/courts/0/booking/rules/1',
      rule: 'overlap',
    });
    expect(findSettingsIssues(withRules(rule(), rule({ days: ['wed'] })))).toEqual([]);
  });

  it('flags closing before opening', () => {
    const bad = rule({ opens_at: '20:00', closes_at: '10:00' });
    expect(findSettingsIssues(withRules(bad)).map((i) => i.rule)).toContain('before_opens_at');
  });

  it('flags an enabled extra without price and a monthly coach plan without fee', () => {
    const issues = findSettingsIssues({
      charges: {
        player_extra: { enabled: true, amount_cents: null },
        coach_plan: { type: 'coach_monthly' },
        lesson_payments_enabled: false,
      },
    });
    expect(issues.map((i) => i.path)).toEqual([
      '/charges/player_extra/amount_cents',
      '/charges/coach_plan/monthly_fee_cents',
    ]);
  });
});
