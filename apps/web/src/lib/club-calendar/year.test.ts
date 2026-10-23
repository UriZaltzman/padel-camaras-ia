import { describe, expect, it } from 'vitest';

import {
  bookedMinutesByDay,
  datesTouched,
  heatLevel,
  leadingBlanks,
  localInstant,
  monthDates,
  occupancy,
  orderedRange,
} from './year';

describe('year calendar model', () => {
  it('lists the days of a month, leap February included', () => {
    expect(monthDates(2027, 1)).toHaveLength(28);
    expect(monthDates(2028, 1)).toHaveLength(29);
    expect(monthDates(2026, 11).at(-1)).toBe('2026-12-31');
  });

  it('pads the first week so it starts on Monday', () => {
    expect(leadingBlanks(2026, 9)).toBe(3); // 1 Oct 2026 is a Thursday
  });

  it('maps instants to Buenos Aires days', () => {
    expect(datesTouched('2026-10-24T02:00:00Z', '2026-10-24T04:00:00Z')).toEqual([
      '2026-10-23',
      '2026-10-24',
    ]);
    expect(localInstant('2026-10-23', '24:00')).toBe('2026-10-24T03:00:00.000Z');
  });

  it('sums booked minutes and skips cancelled turns', () => {
    const base = { status: 'confirmed' } as const;
    const minutes = bookedMinutesByDay([
      { ...base, starts_at: '2026-10-23T21:00:00Z', ends_at: '2026-10-23T22:30:00Z' },
      { ...base, starts_at: '2026-10-23T23:00:00Z', ends_at: '2026-10-24T00:00:00Z' },
      { status: 'cancelled', starts_at: '2026-10-23T21:00:00Z', ends_at: '2026-10-23T22:30:00Z' },
    ] as never);
    expect(minutes.get('2026-10-23')).toBe(150);
  });

  it('turns occupancy into heat levels', () => {
    expect(occupancy(480, 2, 8)).toBe(0.5);
    expect(occupancy(10, 0, 8)).toBe(0);
    expect([0, 0.1, 0.5, 0.9, 1].map(heatLevel)).toEqual([0, 1, 2, 4, 4]);
  });

  it('orders a picked range', () => {
    expect(orderedRange('2026-12-01', '2026-11-01')).toEqual({
      from: '2026-11-01',
      to: '2026-12-01',
    });
  });
});
