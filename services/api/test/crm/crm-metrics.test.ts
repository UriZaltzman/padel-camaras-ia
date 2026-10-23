import { describe, expect, it } from 'vitest';
import { computeMetrics, type CrmBooking, type CrmBookingStatus } from '../../src/crm/crm-metrics';

const NOW = new Date('2026-11-01T12:00:00.000Z');
const DAY = 86_400_000;

function booking(daysAgo: number, status: CrmBookingStatus, position = 1): CrmBooking {
  const startsAt = new Date(NOW.getTime() - daysAgo * DAY);
  return {
    id: `b-${daysAgo}-${status}`,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 90 * 60_000),
    status,
    position,
  };
}

describe('CRM metrics', () => {
  it('matches a hand count: 4 visits in 8 weeks, 1 no-show', () => {
    const m = computeMetrics(
      [
        booking(2, 'confirmed'), // week 0
        booking(8, 'completed'), // week 1
        booking(22, 'confirmed'), // week 3
        booking(42, 'confirmed'), // week 6
        booking(90, 'confirmed'), // outside the window, still the oldest visit
        booking(12, 'no_show'), // not a visit
        booking(5, 'cancelled'), // ignored
      ],
      NOW,
    );
    expect(m.bookingsPerMonth).toBe(2.1); // 4 * 30 / 56
    expect(m.activeWeeks).toBe(4);
    expect(m.noShows).toBe(1);
    expect(m.lastVisitAt).toEqual(new Date(NOW.getTime() - 2 * DAY));
    expect(m.segments).toEqual(['frequent']);
  });

  it('counts two bookings of the same week once for recurrence', () => {
    const m = computeMetrics([booking(2, 'confirmed'), booking(3, 'confirmed')], NOW);
    expect(m.activeWeeks).toBe(1);
    expect(m.bookingsPerMonth).toBe(1.1);
  });

  it('ignores future bookings and invited players do not carry no-shows', () => {
    const m = computeMetrics(
      [booking(-3, 'confirmed'), booking(10, 'no_show', 2), booking(11, 'no_show', 1)],
      NOW,
    );
    expect(m.lastVisitAt).toBeNull();
    expect(m.noShows).toBe(1);
    expect(m.segments).toEqual(['dormant']);
  });

  it('flags dormant after 30 days and no_show from two', () => {
    const m = computeMetrics(
      [booking(31, 'confirmed'), booking(40, 'no_show'), booking(41, 'no_show')],
      NOW,
    );
    expect(m.segments).toEqual(['dormant', 'no_show']);
    expect(computeMetrics([booking(30, 'confirmed')], NOW).segments).toEqual([]);
  });
});
