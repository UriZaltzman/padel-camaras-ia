import { describe, expect, it } from 'vitest';
import type { BookingRule } from '../../src/clubs/club-model';
import { generateSlots, localToUtc, type Interval } from '../../src/bookings/slots';

// Property tests (seeded, reproducible) for mixed 60/90/120-minute bookings on a 30-minute grid.
const TZ = 'America/Argentina/Buenos_Aires';
const DATE = '2030-03-12';
const NOW = new Date('2030-03-01T12:00:00Z');
const DURATIONS = [60, 90, 120] as const;
const MIN = 60_000;

const rule = (closes: string): BookingRule => ({
  days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  opens_at: '08:00',
  closes_at: closes,
  allowed_durations: [60, 90, 120],
  start_interval_minutes: 30,
  price_bands: [
    {
      starts_at: '08:00',
      ends_at: closes,
      prices: DURATIONS.map((d) => ({ duration_minutes: d, amount_cents: d * 20 })),
    },
  ],
});

/** mulberry32: small seeded PRNG so a failing sequence can be replayed. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (minutes: number): Date => localToUtc(DATE, minutes, TZ);
const slotsFor = (
  rules: BookingRule[],
  duration: number,
  occupied: Interval[],
  avoidOrphanGaps = false,
) =>
  generateSlots({
    rules,
    date: DATE,
    timezone: TZ,
    durationMinutes: duration,
    deposit: { type: 'none' },
    occupied,
    now: NOW,
    minNoticeMinutes: 30,
    horizonDays: 14,
    avoidOrphanGaps,
  });

function overlaps(list: Interval[]): boolean {
  const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime());
  return sorted.some((x, i) => i > 0 && x.start < (sorted[i - 1] as Interval).end);
}

/** Free 30-minute grid cells that no duration could ever use (gap between busy edges < 60). */
function orphanCells(occupied: Interval[], opens: number, closes: number): number {
  const edges = [...occupied]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((o) => ({
      s: (o.start.getTime() - at(0).getTime()) / MIN,
      e: (o.end.getTime() - at(0).getTime()) / MIN,
    }));
  let cursor = opens;
  let orphans = 0;
  for (const { s, e } of [...edges, { s: closes, e: closes }]) {
    const gap = s - cursor;
    if (gap > 0 && gap < 60) orphans += gap / 30;
    cursor = Math.max(cursor, e);
  }
  return orphans;
}

/** Fills a day by booking random offered starts until a random stopping point. */
function fillDay(
  rules: BookingRule[],
  opens: number,
  closes: number,
  rnd: () => number,
  avoid: boolean,
) {
  const openAt = at(opens).getTime();
  const closeAt = at(closes).getTime();
  const booked: Interval[] = [];
  const attempts = 3 + Math.floor(rnd() * 14);
  for (let i = 0; i < attempts; i++) {
    const duration = DURATIONS[Math.floor(rnd() * 3)] as number;
    const offered = slotsFor(rules, duration, booked, avoid);
    // (2) every offered start fits entirely in free time and inside opening hours
    const bad = offered.filter(
      (s) =>
        booked.some((b) => s.start < b.end && s.end > b.start) ||
        s.start.getTime() < openAt ||
        // (4) never offered past closing time
        s.end.getTime() > closeAt ||
        (s.end.getTime() - s.start.getTime()) / MIN !== duration ||
        ((s.start.getTime() - openAt) / MIN) % 30 !== 0,
    );
    expect(bad).toEqual([]);
    const pick = offered[Math.floor(rnd() * offered.length)];
    if (pick) booked.push({ start: pick.start, end: pick.end });
    // (1) never an overlap
    expect(overlaps(booked)).toBe(false);
  }
  return booked;
}

describe('mixed 60/90/120 minute bookings (property)', () => {
  const rules = [rule('24:00')];

  it('never overlaps and only offers starts that fit, over thousands of sequences', () => {
    const rnd = prng(337);
    for (let n = 0; n < 1500; n++) fillDay(rules, 480, 1440, rnd, false);
  });

  it('holds with the orphan-gap rule on, and for a court closing after midnight', () => {
    const rnd = prng(338);
    for (let n = 0; n < 500; n++) fillDay(rules, 480, 1440, rnd, true);
    const late = [rule('02:00')];
    for (let n = 0; n < 500; n++) fillDay(late, 480, 1560, rnd, n % 2 === 0);
  });

  it('lets 18:00-19:30, 19:30-20:30 and 120/60 mixes sit back to back', () => {
    const first = slotsFor(rules, 90, []).find((s) => s.start.getTime() === at(1080).getTime());
    expect(first).toBeDefined();
    const busy = [{ start: at(1080), end: at(1170) }];
    const next = slotsFor(rules, 60, busy).find((s) => s.start.getTime() === at(1170).getTime());
    expect(next?.end.getTime()).toBe(at(1230).getTime());
    const afterBoth = [...busy, { start: at(1170), end: at(1230) }];
    expect(
      slotsFor(rules, 120, afterBoth).some((s) => s.start.getTime() === at(1230).getTime()),
    ).toBe(true);
    expect(
      slotsFor(rules, 60, [{ start: at(960), end: at(1080) }]).some(
        (s) => s.start.getTime() === at(1080).getTime(),
      ),
    ).toBe(true);
  });

  it('never offers a booking that would end past closing time', () => {
    for (const d of DURATIONS) {
      const offered = slotsFor([rule('22:00')], d, []);
      expect(offered.at(-1)?.end.getTime()).toBe(at(1320).getTime());
      expect(offered.some((s) => s.end > at(1320))).toBe(false);
    }
  });

  it('measures orphan 30-minute cells with and without the rule', () => {
    const run = (avoid: boolean) => {
      const rnd = prng(2026);
      let orphans = 0;
      let freeCells = 0;
      for (let n = 0; n < 400; n++) {
        // Players keep booking until nothing is offered: a "full" day.
        const booked: Interval[] = [];
        for (;;) {
          const d = DURATIONS[Math.floor(rnd() * 3)] as number;
          const offered = slotsFor(rules, d, booked, avoid);
          const pick = offered[Math.floor(rnd() * offered.length)];
          if (!pick) {
            // stop once no duration fits any more
            if (DURATIONS.every((x) => slotsFor(rules, x, booked, avoid).length === 0)) break;
            continue;
          }
          booked.push({ start: pick.start, end: pick.end });
        }
        orphans += orphanCells(booked, 480, 1440);
        freeCells +=
          32 - booked.reduce((a, b) => a + (b.end.getTime() - b.start.getTime()) / (30 * MIN), 0);
      }
      return { orphans, freeCells, perDay: orphans / 400 };
    };
    const off = run(false);
    const on = run(true);
    // Measured: ~3 of 32 cells per full day become unbookable without the rule, 0 with it.
    expect(off.perDay).toBeGreaterThan(1);
    expect(on.orphans).toBeLessThan(off.orphans);
    // With the rule, orphans can only come from the gaps the rule cannot prevent.
    expect(on.perDay).toBeLessThan(off.perDay);
  });

  it('with the rule on, a free gap is never reduced to 30 minutes by an offered start', () => {
    const rnd = prng(99);
    for (let n = 0; n < 500; n++) {
      const booked = fillDay(rules, 480, 1440, rnd, true);
      const before = orphanCells(booked, 480, 1440);
      // Each booking made under the rule must not have created an orphan itself.
      expect(before).toBe(0);
    }
  });
});
