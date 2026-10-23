import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionService } from '../../src/auth/session/session.service';
import { newId } from '../../src/db/ids';
import { adminUrl, createScratchDb, psql } from '../db/scratch-db';
import { createTestApp } from '../helpers';

describe.skipIf(!adminUrl)('favorite clubs against Postgres', () => {
  const db = adminUrl ? createScratchDb('favorites') : { url: '', drop: () => undefined };
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const [clubA, clubB, clubC] = [newId(), newId(), newId()];
  const [courtA, courtB] = [newId(), newId()];
  const [me, other, owner] = [newId(), newId(), newId()];

  const as = async (
    method: 'get' | 'put' | 'delete' | 'post',
    url: string,
    userId: string,
    payload?: object,
  ) => {
    const token = (await ctx.app.get(SessionService).issue(userId)).access_token;
    const req = request(ctx.app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);
    return payload ? req.send(payload) : req;
  };
  const ids = (res: { body: { items: { club_id: string }[] } }) =>
    res.body.items.map((i) => i.club_id);

  beforeAll(async () => {
    const court = (c: string, k: string) => {
      const r = newId();
      return `
      INSERT INTO courts (id, club_id, name, updated_at) VALUES ('${k}', '${c}', 'Cancha 1', now());
      INSERT INTO booking_slots_rules (id, club_id, court_id, days_of_week, opens_at, closes_at, allowed_durations_minutes, start_interval_minutes, deposit_kind, deposit_bps, updated_at)
        VALUES ('${r}', '${c}', '${k}', '{1,2,3,4,5,6,7}', '08:00', '00:00', '{60,90}', 30, 'percent', 3000, now());
      INSERT INTO booking_rule_price_bands (id, club_id, rule_id, starts_at, ends_at, duration_minutes, price_cents, updated_at)
        VALUES ('${randomUUID()}', '${c}', '${r}', '08:00', '00:00', 90, 1000, now());`;
    };
    psql(
      db.url,
      `INSERT INTO clubs (id, name, address, plan, updated_at) VALUES
         ('${clubA}', 'Club A', 'Calle 1', 'loan', now()), ('${clubB}', 'Club B', 'Calle 2', 'loan', now()),
         ('${clubC}', 'Club C', NULL, 'loan', now());
       ${court(clubA, courtA)} ${court(clubB, courtB)}
       INSERT INTO users (id, name, updated_at) VALUES ('${me}', 'Yo', now()), ('${other}', 'Otra', now()), ('${owner}', 'Dueño', now());
       INSERT INTO memberships (id, club_id, user_id, role, status, updated_at)
         VALUES ('${newId()}', '${clubA}', '${owner}', 'owner', 'active', now());`,
    );
    ctx = await createTestApp([], { databaseUrl: db.url });
  }, 60_000);

  afterAll(async () => {
    await ctx.app.close();
    db.drop();
  });

  it('starts empty', async () => {
    const res = await as('get', '/v1/me/favorite-clubs', me);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
    expect((await as('get', '/v1/me/home', me)).body).toEqual({ favorites: [] });
  });

  it('adds in order, twice is a no-op, unknown club is 404', async () => {
    expect(ids(await as('put', `/v1/me/favorite-clubs/${clubA}`, me))).toEqual([clubA]);
    expect(ids(await as('put', `/v1/me/favorite-clubs/${clubB}`, me))).toEqual([clubA, clubB]);
    expect(ids(await as('put', `/v1/me/favorite-clubs/${clubA}`, me))).toEqual([clubA, clubB]);
    const missing = await as('put', `/v1/me/favorite-clubs/${newId()}`, me);
    expect(missing.status).toBe(404);
  });

  it('reorders, and rejects a list that is not exactly the favorites', async () => {
    const ok = await as('put', '/v1/me/favorite-clubs', me, { club_ids: [clubB, clubA] });
    expect(ids(ok)).toEqual([clubB, clubA]);
    expect(ok.body.items.map((i: { position: number }) => i.position)).toEqual([0, 1]);
    for (const club_ids of [[clubA], [clubA, clubB, clubC], [clubA, clubA]]) {
      const bad = await as('put', '/v1/me/favorite-clubs', me, { club_ids });
      expect(bad.status).toBe(400);
    }
  });

  it('removes, closes the gap and tolerates removing twice', async () => {
    await as('put', `/v1/me/favorite-clubs/${clubC}`, me);
    expect((await as('delete', `/v1/me/favorite-clubs/${clubA}`, me)).status).toBe(204);
    expect((await as('delete', `/v1/me/favorite-clubs/${clubA}`, me)).status).toBe(204);
    const list = await as('get', '/v1/me/favorite-clubs', me);
    expect(ids(list)).toEqual([clubB, clubC]);
    expect(list.body.items.map((i: { position: number }) => i.position)).toEqual([0, 1]);
    await as('put', `/v1/me/favorite-clubs/${clubA}`, me);
  });

  it('another player cannot read or write mine (RLS)', async () => {
    expect((await as('get', '/v1/me/favorite-clubs', other)).body).toEqual({ items: [] });
    await as('delete', `/v1/me/favorite-clubs/${clubB}`, other);
    expect(ids(await as('get', '/v1/me/favorite-clubs', me))).toEqual([clubB, clubC, clubA]);
    // At the database level: the other player's context sees no row of mine, and cannot insert one for me.
    const asOther = (sql: string) =>
      psql(
        db.url,
        `BEGIN; SET LOCAL ROLE app_runtime; SET LOCAL app.role = 'player'; SET LOCAL app.user_id = '${other}'; ${sql}; COMMIT`,
      );
    expect(asOther('SELECT count(*) FROM player_favorite_clubs').split('\n').pop()).toContain('0');
    expect(() =>
      asOther(
        `INSERT INTO player_favorite_clubs (id, club_id, user_id, position) VALUES ('${newId()}', '${clubC}', '${me}', 9)`,
      ),
    ).toThrow();
  });

  it('a club never reads the favorites; it only gets an anonymous count', async () => {
    const asOwner = (sql: string) =>
      psql(
        db.url,
        `BEGIN; SET LOCAL ROLE app_runtime; SET LOCAL app.role = 'owner'; SET LOCAL app.user_id = '${owner}'; SET LOCAL app.club_id = '${clubA}'; ${sql}; COMMIT`,
      );
    expect(asOwner('SELECT count(*) FROM player_favorite_clubs').split('\n').pop()).toContain('0');
    const res = await as('get', `/v1/club-admin/favorite-count?club_id=${clubA}`, owner);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ favorite_count: 1 });
    expect(Object.keys(res.body)).toEqual(['favorite_count']);
    // A player who is not staff of the club gets nothing.
    expect((await as('get', `/v1/club-admin/favorite-count?club_id=${clubA}`, me)).status).toBe(
      404,
    );
  });

  it('home returns the next booking under its favorite and free starts', async () => {
    const tomorrow = new Date(ctx.clock.now().getTime() + 26 * 3_600_000);
    tomorrow.setUTCHours(15, 0, 0, 0);
    const book = await as('post', '/v1/bookings', me, {
      court_id: courtB,
      starts_at: tomorrow.toISOString(),
      duration_minutes: 90,
    });
    expect(book.body).toMatchObject({ status: expect.any(String) });
    const home = await as('get', '/v1/me/home', me);
    expect(home.status).toBe(200);
    const byClub = Object.fromEntries(
      home.body.favorites.map((f: { club: { club_id: string } }) => [f.club.club_id, f]),
    );
    expect(home.body.favorites.map((f: { club: { club_id: string } }) => f.club.club_id)).toEqual([
      clubB,
      clubC,
      clubA,
    ]);
    expect(byClub[clubB].next_bookings.map((b: { id: string }) => b.id)).toEqual([book.body.id]);
    expect(byClub[clubA].next_bookings).toEqual([]);
    expect(byClub[clubC].free_slots_today).toEqual([]); // no courts
    const free = byClub[clubA].free_slots_today as { starts_at: string; court_id: string }[];
    expect(free).toHaveLength(3);
    expect(free.every((s) => new Date(s.starts_at) > ctx.clock.now())).toBe(true);
    expect(free.every((s) => s.court_id === courtA)).toBe(true);
  });
});
