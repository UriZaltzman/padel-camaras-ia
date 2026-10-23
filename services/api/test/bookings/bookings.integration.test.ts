import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BookingsService } from '../../src/bookings/bookings.service';
import { AppError } from '../../src/errors/app-error';
import { HoldExpiryService } from '../../src/bookings/hold-expiry.service';
import { SessionService } from '../../src/auth/session/session.service';
import { newId } from '../../src/db/ids';
import { adminUrl, createScratchDb, psql } from '../db/scratch-db';
import { createTestApp } from '../helpers';

// Availability and holds against a real Postgres: the exclusion constraint (#39) and RLS decide.
describe.skipIf(!adminUrl)('availability and booking holds', () => {
  const db = adminUrl ? createScratchDb('bookings') : { url: '', drop: () => undefined };
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let token = '';
  // Tokens are minted on the fake clock, which these tests move: refresh before each phase.
  const refreshToken = async (): Promise<void> => {
    token = (await ctx.app.get(SessionService).issue(player)).access_token;
  };
  const club = newId();
  const court = newId();
  const rule = newId();
  const player = newId();
  // The fake clock starts at 2026-11-01T12:00Z; 2026-11-02 19:00 local is 22:00 UTC.
  const startsAt = '2026-11-02T22:00:00.000Z';
  const body = { court_id: court, starts_at: startsAt, duration_minutes: 90 as const };

  beforeAll(async () => {
    psql(
      db.url,
      `INSERT INTO clubs (id, name, address, plan, updated_at) VALUES ('${club}', 'Club', 'Calle 1', 'loan', now());
       INSERT INTO courts (id, club_id, name, updated_at) VALUES ('${court}', '${club}', 'Cancha 1', now());
       INSERT INTO users (id, name, updated_at) VALUES ('${player}', 'Ana', now());
       INSERT INTO booking_slots_rules (id, club_id, court_id, days_of_week, opens_at, closes_at, allowed_durations_minutes, start_interval_minutes, deposit_kind, deposit_bps, updated_at)
         VALUES ('${rule}', '${club}', '${court}', '{1,2,3,4,5,6,7}', '08:00', '00:00', '{60,90}', 30, 'percent', 3000, now());
       INSERT INTO booking_rule_price_bands (id, club_id, rule_id, starts_at, ends_at, duration_minutes, price_cents, updated_at)
         VALUES ('${randomUUID()}', '${club}', '${rule}', '08:00', '00:00', 90, 1500, now()),
                ('${randomUUID()}', '${club}', '${rule}', '08:00', '00:00', 60, 1000, now());`,
    );
    ctx = await createTestApp([], {
      databaseUrl: `${db.url}?connection_limit=40&pool_timeout=120`,
    });
    await refreshToken();
  }, 60_000);

  afterAll(async () => {
    await ctx.app.close();
    db.drop();
  });

  const http = () => request(ctx.app.getHttpServer());
  const book = () => http().post('/v1/bookings').set('Authorization', `Bearer ${token}`).send(body);

  it('lists free starts without credentials, with price and deposit', async () => {
    const res = await http().get(
      `/v1/courts/${court}/availability?date=2026-11-02&duration_minutes=90`,
    );
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe('America/Argentina/Buenos_Aires');
    const slot = res.body.slots.find((s: { starts_at: string }) => s.starts_at === startsAt);
    expect(slot).toMatchObject({ amount_cents: 1500, deposit_cents: 450 });
  });

  it('answers availability in well under 300 ms (p95 over 50 cached and uncached calls)', async () => {
    const times: number[] = [];
    for (let i = 0; i < 50; i++) {
      ctx.clock.advanceSeconds(31); // expire the cache on purpose
      const t0 = performance.now();
      await http()
        .get(`/v1/courts/${court}/availability?date=2026-11-03&duration_minutes=60`)
        .expect(200);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.95)]).toBeLessThan(300);
  });

  it('gives exactly one booking out of 1000 simultaneous attempts', async () => {
    // Straight at the service: 1000 sockets would only test supertest. Each attempt still
    // goes through the real transaction, RLS and the exclusion constraint.
    const service = ctx.app.get(BookingsService);
    const results = await Promise.allSettled(
      Array.from({ length: 1000 }, () =>
        service.create({ userId: player, sessionId: 's' }, { ...body, duration_minutes: 90 }),
      ),
    );
    const winners = results.filter((r) => r.status === 'fulfilled');
    const errors = results.flatMap((r) => (r.status === 'rejected' ? [r.reason as AppError] : []));
    expect(
      errors.filter((e) => !(e instanceof AppError) || e.code !== 'BOOKING_SLOT_TAKEN'),
    ).toEqual([]);
    expect(winners).toHaveLength(1);
    expect(errors).toHaveLength(999);
    expect(errors[0]?.details).toMatchObject({ court_id: court, starts_at: startsAt });
    expect(winners[0]?.value).toMatchObject({
      status: 'held',
      deposit_cents: 450,
      duration_minutes: 90,
    });
    expect(psql(db.url, `SELECT count(*) FROM bookings WHERE court_id = '${court}'`)).toBe('1');
  }, 120_000);

  it('hides the booked slot, and a vencido hold frees it', async () => {
    ctx.clock.advanceSeconds(31);
    const busy = await http().get(
      `/v1/courts/${court}/availability?date=2026-11-02&duration_minutes=90`,
    );
    expect(busy.body.slots.some((s: { starts_at: string }) => s.starts_at === startsAt)).toBe(
      false,
    );

    ctx.clock.advanceSeconds(11 * 60);
    expect(await ctx.app.get(HoldExpiryService).runOnce()).toBe(1);
    expect(psql(db.url, `SELECT status FROM bookings WHERE court_id = '${court}'`)).toBe('expired');
    await refreshToken();
    const again = await book();
    expect(again.status).toBe(201);
  });

  it('replays the same booking for the same Idempotency-Key', async () => {
    const other = { ...body, starts_at: '2026-11-02T23:30:00.000Z' };
    await refreshToken();
    const key = randomUUID();
    const send = () =>
      http()
        .post('/v1/bookings')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send(other);
    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
  });
});
