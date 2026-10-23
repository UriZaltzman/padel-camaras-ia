import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AvailabilityService } from '../../src/bookings/availability.service';
import { BookingsService } from '../../src/bookings/bookings.service';
import { AppError } from '../../src/errors/app-error';
import { newId } from '../../src/db/ids';
import { adminUrl, createScratchDb, psql } from '../db/scratch-db';
import { createTestApp } from '../helpers';

// Mixed 60/90/120 minute bookings on a real Postgres: sequential and concurrent, through the
// real service (rules, advisory lock, RLS) and the exclusion constraint (#39).
describe.skipIf(!adminUrl)('mixed-duration bookings against Postgres', () => {
  const db = adminUrl ? createScratchDb('mixed') : { url: '', drop: () => undefined };
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const club = newId();
  const player = newId();
  const auth = { userId: player, sessionId: 's' };
  const DATE = '2026-11-02'; // fake clock starts 2026-11-01T12:00Z; 18:00 local = 21:00Z
  const DURATIONS = [60, 90, 120] as const;

  let courtCount = 0;
  function newCourt(): string {
    const court = newId();
    const rule = newId();
    psql(
      db.url,
      `INSERT INTO courts (id, club_id, name, updated_at) VALUES ('${court}', '${club}', 'C-${++courtCount}', now());
       INSERT INTO booking_slots_rules (id, club_id, court_id, days_of_week, opens_at, closes_at, allowed_durations_minutes, start_interval_minutes, deposit_kind, updated_at)
         VALUES ('${rule}', '${club}', '${court}', '{1,2,3,4,5,6,7}', '08:00', '22:00', '{60,90,120}', 30, 'none', now());
       INSERT INTO booking_rule_price_bands (id, club_id, rule_id, starts_at, ends_at, duration_minutes, price_cents, updated_at)
         VALUES ${DURATIONS.map((d) => `('${randomUUID()}', '${club}', '${rule}', '08:00', '22:00', ${d}, ${d * 20}, now())`).join(',')};`,
    );
    return court;
  }

  const overlaps = (court: string): string =>
    psql(
      db.url,
      `SELECT count(*) FROM bookings a JOIN bookings b ON a.court_id = b.court_id AND a.id < b.id
        WHERE a.court_id = '${court}' AND a.status IN ('held','confirmed')
          AND b.status IN ('held','confirmed') AND a.starts_at < b.ends_at AND a.ends_at > b.starts_at`,
    );

  beforeAll(async () => {
    psql(
      db.url,
      `INSERT INTO clubs (id, name, address, plan, updated_at) VALUES ('${club}', 'Club', 'Calle 1', 'loan', now());
       INSERT INTO users (id, name, updated_at) VALUES ('${player}', 'Ana', now());`,
    );
    ctx = await createTestApp([], {
      databaseUrl: `${db.url}?connection_limit=40&pool_timeout=120`,
    });
  }, 60_000);

  afterAll(async () => {
    await ctx.app.close();
    db.drop();
  });

  const slots = async (court: string, duration: number) => {
    ctx.app.get(AvailabilityService).invalidateAll();
    return (await ctx.app.get(AvailabilityService).forCourt(court, DATE, duration)).slots;
  };
  const book = (court: string, starts_at: string, duration_minutes: 60 | 90 | 120) =>
    ctx.app.get(BookingsService).create(auth, { court_id: court, starts_at, duration_minutes });

  it('lets 90 min at 18:00 and 60 min at 19:30 (and a 120 right before) sit back to back', async () => {
    const court = newCourt();
    await book(court, '2026-11-02T21:00:00.000Z', 90);
    await book(court, '2026-11-02T22:30:00.000Z', 60);
    const free120 = await slots(court, 120);
    expect(free120.some((s) => s.starts_at === '2026-11-02T19:00:00.000Z')).toBe(true);
    await book(court, '2026-11-02T19:00:00.000Z', 120);
    expect(overlaps(court)).toBe('0');
    // An overlapping attempt of any other duration is refused.
    await expect(book(court, '2026-11-02T22:00:00.000Z', 60)).rejects.toMatchObject({
      code: 'BOOKING_SLOT_TAKEN',
    });
  });

  it('random sequences: every offered start books, nothing overlaps, nothing ends past 22:00', async () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let n = 0; n < 25; n++) {
      const court = newCourt();
      for (let i = 0; i < 12; i++) {
        const duration = DURATIONS[Math.floor(rnd() * 3)] as 60 | 90 | 120;
        const offered = await slots(court, duration);
        // (4) nothing offered ends after 22:00 local (01:00Z next day)
        expect(offered.every((s) => s.ends_at <= '2026-11-03T01:00:00.000Z')).toBe(true);
        const pick = offered[Math.floor(rnd() * offered.length)];
        if (!pick) continue;
        // (2) an offered start must always be bookable (no phantom availability)
        await book(court, pick.starts_at, duration);
      }
      expect(overlaps(court)).toBe('0');
    }
  }, 180_000);

  it('concurrent inserts with different durations: only one winner per overlap, never an overlap', async () => {
    for (let round = 0; round < 8; round++) {
      const court = newCourt();
      const service = ctx.app.get(BookingsService);
      const starts = Array.from({ length: 24 }, (_, i) => {
        const startMs = Date.parse('2026-11-02T11:00:00.000Z') + i * 30 * 60_000;
        return new Date(startMs).toISOString();
      });
      const attempts = Array.from({ length: 60 }, (_, i) => ({
        starts_at: starts[(i * 7) % starts.length] as string,
        duration: DURATIONS[i % 3] as 60 | 90 | 120,
      }));
      const results = await Promise.allSettled(
        attempts.map((a) =>
          service.create(auth, {
            court_id: court,
            starts_at: a.starts_at,
            duration_minutes: a.duration,
          }),
        ),
      );
      const errors = results.flatMap((r) => (r.status === 'rejected' ? [r.reason as unknown] : []));
      expect(
        errors.filter(
          (e) =>
            !(e instanceof AppError) ||
            (e.code !== 'BOOKING_SLOT_TAKEN' && e.code !== 'BOOKING_SLOT_INVALID'),
        ),
      ).toEqual([]);
      expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
      expect(overlaps(court)).toBe('0');
    }
  }, 180_000);
});
