import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionService } from '../../src/auth/session/session.service';
import { newId } from '../../src/db/ids';
import { adminUrl, createScratchDb, psql } from '../db/scratch-db';
import { createTestApp } from '../helpers';

// Blocks against a real Postgres: they are bookings rows, so the exclusion constraint (#39)
// keeps them from overlapping anything, and RLS keeps the endpoints to the club's staff.
describe.skipIf(!adminUrl)('court blocks', () => {
  const db = adminUrl ? createScratchDb('blocks') : { url: '', drop: () => undefined };
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const club = newId();
  const court1 = newId();
  const court2 = newId();
  const staff = newId();
  const player = newId();
  const booking = newId();
  let staffToken = '';
  let playerToken = '';
  // 2026-11-05 18:00-19:30 local.
  const starts = '2026-11-05T21:00:00.000Z';
  const ends = '2026-11-05T22:30:00.000Z';
  const body = { court_ids: [court1], starts_at: starts, ends_at: ends, kind: 'maintenance' };

  beforeAll(async () => {
    psql(
      db.url,
      `INSERT INTO clubs (id, name, address, plan, updated_at) VALUES ('${club}', 'Club', 'Calle 1', 'loan', now());
       INSERT INTO courts (id, club_id, name, updated_at) VALUES ('${court1}', '${club}', 'C1', now()), ('${court2}', '${club}', 'C2', now());
       INSERT INTO users (id, name, updated_at) VALUES ('${staff}', 'Sol', now()), ('${player}', 'Ana', now());
       INSERT INTO memberships (id, club_id, user_id, role, updated_at) VALUES ('${randomUUID()}', '${club}', '${staff}', 'staff', now());
       INSERT INTO bookings (id, club_id, court_id, starts_at, ends_at, status, price_cents, origin, created_by_user_id, updated_at)
         VALUES ('${booking}', '${club}', '${court1}', '${starts}', '${ends}', 'confirmed', 1000, 'app', '${player}', now());
       INSERT INTO booking_players (id, club_id, booking_id, position, user_id, accepted, accepted_at, updated_at)
         VALUES ('${randomUUID()}', '${club}', '${booking}', 1, '${player}', true, now(), now());`,
    );
    ctx = await createTestApp([], { databaseUrl: db.url });
    const sessions = ctx.app.get(SessionService);
    staffToken = (await sessions.issue(staff)).access_token;
    playerToken = (await sessions.issue(player)).access_token;
  }, 60_000);

  afterAll(async () => {
    await ctx.app.close();
    db.drop();
  });

  const post = (path: string, token: string, payload: unknown) =>
    request(ctx.app.getHttpServer())
      .post(`/v1/clubs/${club}/court-blocks${path}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload as object);

  it('answers 409 over a booking without a policy and writes nothing', async () => {
    const res = await post('', staffToken, body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_SLOT_TAKEN');
    expect(res.body.details.conflicting_booking_ids).toEqual([booking]);
    expect(psql(db.url, `SELECT count(*) FROM court_blocks`)).toBe('0');
  });

  it('is only for the club staff', async () => {
    expect((await post('', playerToken, body)).status).toBe(404);
  });

  it('cancel_and_refund cancels the booking and blocks the court', async () => {
    const res = await post('', staffToken, {
      ...body,
      existing_bookings_policy: 'cancel_and_refund',
    });
    expect(res.status).toBe(201);
    expect(res.body.cancelled_booking_ids).toEqual([booking]);
    expect(psql(db.url, `SELECT status FROM bookings WHERE id = '${booking}'`)).toBe('cancelled');
    expect(psql(db.url, `SELECT count(*) FROM court_blocks`)).toBe('1');
  });

  it('the block hides the slot from availability and the constraint rejects overlaps', async () => {
    ctx.clock.advanceSeconds(31);
    const res = await request(ctx.app.getHttpServer()).get(
      `/v1/courts/${court1}/availability?date=2026-11-05&duration_minutes=90`,
    );
    expect(res.status).toBe(200);
    expect(() =>
      psql(
        db.url,
        `INSERT INTO bookings (id, club_id, court_id, starts_at, ends_at, status, price_cents, origin, updated_at)
         VALUES ('${newId()}', '${club}', '${court1}', '${starts}', '${ends}', 'confirmed', 0, 'app', now())`,
      ),
    ).toThrow();
  });

  it('weekly recurrence writes one block per week', async () => {
    const res = await post('', staffToken, {
      ...body,
      court_ids: [court2],
      recurrence: { frequency: 'weekly', until: '2026-11-19' },
    });
    expect(res.status).toBe(201);
    expect(res.body.blocks).toHaveLength(3);
  });

  it('deleting a block frees the court', async () => {
    const [first] = (
      await request(ctx.app.getHttpServer())
        .get(`/v1/clubs/${club}/court-blocks`)
        .query({ from: '2026-11-01T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z' })
        .set('Authorization', `Bearer ${staffToken}`)
    ).body as { id: string }[];
    const del = await request(ctx.app.getHttpServer())
      .delete(`/v1/clubs/${club}/court-blocks/${first?.id}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(del.status).toBe(204);
  });
});
