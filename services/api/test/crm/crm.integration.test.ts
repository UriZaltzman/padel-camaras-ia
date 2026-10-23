import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionService } from '../../src/auth/session/session.service';
import { newId } from '../../src/db/ids';
import { adminUrl, createScratchDb, psql } from '../db/scratch-db';
import { createTestApp } from '../helpers';

// Club CRM against a real Postgres: metrics come from seeded bookings, RLS scopes the club.
describe.skipIf(!adminUrl)('club CRM (CL-06)', () => {
  const db = adminUrl ? createScratchDb('crm') : { url: '', drop: () => undefined };
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const club = newId();
  const other = newId();
  const court = newId();
  const otherCourt = newId();
  const owner = newId();
  const staff = newId();
  const outsider = newId();
  const ana = newId();
  const bruno = newId();
  const carla = newId();
  const tokens: Record<string, string> = {};
  // The fake clock starts at 2026-11-01T12:00Z.
  const NOW = Date.parse('2026-11-01T12:00:00Z');

  const at = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();
  function booking(c: string, ct: string, user: string, daysAgo: number, status: string) {
    const id = newId();
    const cancelled = status === 'cancelled' ? ', cancelled_at = now()' : '';
    return `INSERT INTO bookings (id, club_id, court_id, starts_at, ends_at, status, price_cents, origin, created_by_user_id, updated_at)
        VALUES ('${id}', '${c}', '${ct}', '${at(daysAgo)}', '${at(daysAgo)}'::timestamptz + interval '90 minutes', '${status}', 1000, 'app', '${user}', now());
      INSERT INTO booking_players (id, club_id, booking_id, position, user_id, accepted, accepted_at, updated_at)
        VALUES ('${newId()}', '${c}', '${id}', 1, '${user}', true, now(), now());
      ${cancelled ? `UPDATE bookings SET cancelled_at = now() WHERE id = '${id}';` : ''}`;
  }

  beforeAll(async () => {
    const people = [
      [owner, 'Olga Dueña', null],
      [staff, 'Sergio Staff', null],
      [outsider, 'Otto Afuera', null],
      [ana, 'Ana Pérez', '+5491155550101'],
      [bruno, 'Bruno Díaz', '+5491155550102'],
      [carla, 'Carla Gómez', '+5491155550103'],
    ];
    psql(
      db.url,
      `INSERT INTO clubs (id, name, plan, updated_at) VALUES ('${club}', 'Club', 'loan', now()), ('${other}', 'Otro', 'loan', now());
       INSERT INTO courts (id, club_id, name, updated_at) VALUES ('${court}', '${club}', 'Cancha 1', now()), ('${otherCourt}', '${other}', 'Cancha 9', now());
       ${people.map(([id, name, phone]) => `INSERT INTO users (id, name, phone, updated_at) VALUES ('${id}', '${name}', ${phone ? `'${phone}'` : 'NULL'}, now());`).join('\n')}
       INSERT INTO memberships (id, club_id, user_id, role, updated_at) VALUES
         ('${newId()}', '${club}', '${owner}', 'owner', now()),
         ('${newId()}', '${club}', '${staff}', 'staff', now()),
         ('${newId()}', '${other}', '${outsider}', 'owner', now());
       -- Ana: 4 visits in 4 different weeks, 1 no-show, 1 cancelled; one visit at the other club.
       ${[
         booking(club, court, ana, 2, 'confirmed'),
         booking(club, court, ana, 8, 'completed'),
         booking(club, court, ana, 22, 'confirmed'),
         booking(club, court, ana, 42, 'confirmed'),
         booking(club, court, ana, 12, 'no_show'),
         booking(club, court, ana, 5, 'cancelled'),
         booking(other, otherCourt, ana, 1, 'confirmed'),
         // Bruno: one visit 60 days ago.
         booking(club, court, bruno, 60, 'completed'),
         // Carla: two no-shows, never came.
         booking(club, court, carla, 14, 'no_show'),
         booking(club, court, carla, 15, 'no_show'),
       ].join('\n')}
       INSERT INTO payments (id, club_id, user_id, concept, amount_cents, status, updated_at) VALUES
         ('${newId()}', '${club}', '${ana}', 'deposit', 1500, 'approved', now()),
         ('${newId()}', '${club}', '${ana}', 'deposit', 1000, 'approved', now()),
         ('${newId()}', '${club}', '${ana}', 'deposit', 700, 'refunded', now()),
         ('${newId()}', '${other}', '${ana}', 'deposit', 9999, 'approved', now());`,
    );
    ctx = await createTestApp([], { databaseUrl: db.url });
    for (const id of [owner, staff, outsider]) {
      tokens[id] = (await ctx.app.get(SessionService).issue(id)).access_token;
    }
  }, 60_000);

  afterAll(async () => {
    await ctx.app.close();
    db.drop();
  });

  const get = (path: string, who: string) =>
    request(ctx.app.getHttpServer()).get(path).set('Authorization', `Bearer ${tokens[who]}`);
  type Row = { name: string; segments: string[] } & Record<string, unknown>;

  it('computes the metrics of a player like a hand count', async () => {
    const res = await get(`/v1/club-admin/players?club_id=${club}`, owner);
    expect(res.status).toBe(200);
    const ana1 = (res.body.items as Row[]).find((p) => p.name === 'Ana Pérez');
    expect(ana1).toMatchObject({
      phone: '+5491155550101',
      bookings_per_month: 2.1,
      active_weeks: 4,
      weeks_window: 8,
      no_shows: 1,
      last_visit_at: at(2),
      total_spend_cents: 2500,
      segments: ['frequent'],
      tags: [],
      notes: null,
    });
  });

  it('orders by last visit and filters by saved segment', async () => {
    const all = await get(`/v1/club-admin/players?club_id=${club}`, owner);
    expect((all.body.items as Row[]).map((p) => p.name)).toEqual([
      'Ana Pérez',
      'Bruno Díaz',
      'Carla Gómez',
    ]);
    const dormant = await get(`/v1/club-admin/players?club_id=${club}&segment=dormant`, owner);
    expect((dormant.body.items as Row[]).map((p) => p.name)).toEqual(['Bruno Díaz', 'Carla Gómez']);
    const noShow = await get(`/v1/club-admin/players?club_id=${club}&segment=no_show`, owner);
    expect((noShow.body.items as Row[]).map((p) => p.name)).toEqual(['Carla Gómez']);
    const search = await get(`/v1/club-admin/players?club_id=${club}&q=5550102`, owner);
    expect((search.body.items as Row[]).map((p) => p.name)).toEqual(['Bruno Díaz']);
  });

  it('pages with an opaque cursor', async () => {
    const first = await get(`/v1/club-admin/players?club_id=${club}&limit=2`, owner);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.next_cursor).toEqual(expect.any(String));
    const second = await get(
      `/v1/club-admin/players?club_id=${club}&limit=2&cursor=${first.body.next_cursor}`,
      owner,
    );
    expect(second.body.items).toHaveLength(1);
    expect(second.body.next_cursor).toBeNull();
  });

  it('hides the spend from staff and keeps the other club out', async () => {
    const res = await get(`/v1/club-admin/players/${ana}?club_id=${club}`, staff);
    expect(res.status).toBe(200);
    expect(res.body.total_spend_cents).toBeNull();
    // 6 bookings at this club; the one at the other club is not shown.
    expect(res.body.recent_bookings).toHaveLength(6);
    expect(res.body.recent_bookings[0]).toMatchObject({
      court_name: 'Cancha 1',
      status: 'confirmed',
    });
  });

  it('refuses people from another club and unknown players', async () => {
    expect((await get(`/v1/club-admin/players?club_id=${club}`, outsider)).status).toBe(404);
    expect((await get(`/v1/club-admin/players/${newId()}?club_id=${club}`, owner)).status).toBe(
      404,
    );
    // The other club's only player is Ana, but with its own data.
    const res = await get(`/v1/club-admin/players?club_id=${other}`, outsider);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ active_weeks: 1, total_spend_cents: 9999 });
  });

  it('saves tags and a note, club-scoped', async () => {
    const put = await request(ctx.app.getHttpServer())
      .put(`/v1/club-admin/players/${bruno}/notes?club_id=${club}`)
      .set('Authorization', `Bearer ${tokens[staff]}`)
      .send({ tags: ['zurdo'], notes: 'Prefiere la noche.' });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ tags: ['zurdo'], notes: 'Prefiere la noche.' });
    const tagged = await get(`/v1/club-admin/players?club_id=${club}&tag=zurdo`, owner);
    expect((tagged.body.items as Row[]).map((p) => p.name)).toEqual(['Bruno Díaz']);
    const stranger = await request(ctx.app.getHttpServer())
      .put(`/v1/club-admin/players/${newId()}/notes?club_id=${club}`)
      .set('Authorization', `Bearer ${tokens[owner]}`)
      .send({ tags: [], notes: null });
    expect(stranger.status).toBe(404);
  });
});
