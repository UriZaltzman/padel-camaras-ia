import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionService } from '../../src/auth/session/session.service';
import { newId } from '../../src/db/ids';
import { adminUrl, createScratchDb, psql } from '../db/scratch-db';
import { createTestApp } from '../helpers';

// ID guessing on the REST API (issue #112): users of club B, with every role they can have, call
// every route that takes an id, a club or a user with the ids of club A's resources. Real app,
// real Postgres, real policies. Nothing of club A may come back, and nothing of A may change.
// Routes are enumerated from the running app: a new route that is not listed below (or marked
// public on purpose) fails `covers every route`, so nobody can add an endpoint and skip this.

const SECRET = 'SECRETO-DEL-CLUB-A';

describe.skipIf(!adminUrl)('API isolation between clubs', () => {
  const db = adminUrl ? createScratchDb('apiiso') : { url: '', drop: () => undefined };
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const tokens = new Map<string, string>();

  const A = {
    club: newId(),
    court: newId(),
    owner: newId(),
    staff: newId(),
    coach: newId(),
    player: newId(),
    other: newId(),
    booking: newId(),
    blockBooking: newId(),
    block: newId(),
    match: newId(),
    lesson: newId(),
    request: newId(),
    tournament: newId(),
  };
  const B = {
    club: newId(),
    court: newId(),
    owner: newId(),
    staff: newId(),
    coach: newId(),
    player: newId(),
  };

  beforeAll(async () => {
    const club = (c: { club: string; court: string }, n: string): string => `
      INSERT INTO clubs (id, name, plan, cuit, updated_at) VALUES ('${c.club}', '${n === 'A' ? SECRET : 'Club B'}', 'loan', '${n === 'A' ? '30111111118' : '30222222229'}', now());
      INSERT INTO club_modules (club_id, tournaments, updated_at) VALUES ('${c.club}', true, now());
      INSERT INTO courts (id, club_id, name, updated_at) VALUES ('${c.court}', '${c.club}', 'Cancha ${n}', now());`;
    const people = (c: typeof A | typeof B, n: string): string => {
      const roles: [string, string][] = [
        [c.owner, 'owner'],
        [c.staff, 'staff'],
        [c.coach, 'coach'],
        [c.player, 'player'],
      ];
      return roles
        .map(
          ([
            u,
            r,
          ]) => `INSERT INTO users (id, name, updated_at) VALUES ('${u}', '${n === 'A' ? SECRET : 'B'} ${r}', now());
          INSERT INTO memberships (id, club_id, user_id, role, updated_at) VALUES ('${newId()}', '${c.club}', '${u}', '${r}', now());`,
        )
        .join('\n');
    };
    psql(
      db.url,
      `${club(A, 'A')} ${club(B, 'B')} ${people(A, 'A')} ${people(B, 'B')}
       INSERT INTO users (id, name, updated_at) VALUES ('${A.other}', '${SECRET} other', now());
       INSERT INTO bookings (id, club_id, court_id, starts_at, ends_at, status, origin, price_cents, created_by_user_id, updated_at)
         VALUES ('${A.booking}', '${A.club}', '${A.court}', '2030-11-01 18:00+00', '2030-11-01 19:30+00', 'confirmed', 'app', 1000, '${A.player}', now()),
                ('${A.blockBooking}', '${A.club}', '${A.court}', '2030-11-02 18:00+00', '2030-11-02 19:30+00', 'confirmed', 'app', 0, '${A.owner}', now());
       INSERT INTO court_blocks (id, club_id, booking_id, kind, reason) VALUES ('${A.block}', '${A.club}', '${A.blockBooking}', 'maintenance', '${SECRET}');
       INSERT INTO matches (id, club_id, court_id, booking_id, starts_at, ends_at, updated_at)
         VALUES ('${A.match}', '${A.club}', '${A.court}', '${A.booking}', '2030-11-01 18:00+00', '2030-11-01 19:30+00', now());
       INSERT INTO match_players (id, club_id, match_id, user_id, team, initial_side, track_index, updated_at)
         VALUES ('${newId()}', '${A.club}', '${A.match}', '${A.player}', 1, 'a', 0, now()), ('${newId()}', '${A.club}', '${A.match}', '${A.other}', 2, 'b', 1, now());
       INSERT INTO lessons (id, club_id, match_id, coach_user_id, kind, notes, updated_at)
         VALUES ('${A.lesson}', '${A.club}', '${A.match}', '${A.coach}', 'private', '${SECRET}', now());
       INSERT INTO lesson_requests (id, club_id, coach_user_id, student_user_id, court_id, starts_at, duration_minutes, message, status, updated_at)
         VALUES ('${A.request}', '${A.club}', '${A.coach}', '${A.player}', '${A.court}', '2030-12-01 18:00+00', 60, '${SECRET}', 'pending', now());
       INSERT INTO player_favorite_clubs (id, club_id, user_id, position) VALUES ('${newId()}', '${A.club}', '${A.player}', 0);
       INSERT INTO tournaments (id, club_id, name, category, points_config, updated_at)
         VALUES ('${A.tournament}', '${A.club}', '${SECRET}', 4, '{}', now());`,
    );
    ctx = await createTestApp([], { databaseUrl: db.url });
    const sessions = ctx.app.get(SessionService);
    for (const id of [...Object.values(B).slice(2), A.player, A.owner]) {
      tokens.set(id, (await sessions.issue(id)).access_token);
    }
    tokens.set(B.owner, (await sessions.issue(B.owner)).access_token);
  }, 60_000);

  afterAll(async () => {
    await ctx.app.close();
    db.drop();
  });

  type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
  interface Attack {
    name: string;
    method: Method;
    path: string;
    body?: object;
    /** Contract path the attack exercises, to prove that every route is covered. */
    route: string;
  }
  const v = (p: string): string => `/v1${p}`;
  const attacks: Attack[] = [
    {
      name: 'read club A settings',
      method: 'patch',
      path: `/clubs/${A.club}/settings`,
      body: { player_horizon_days: 1 },
      route: 'PATCH /v1/clubs/:id/settings',
    },
    {
      name: 'court-blocks list of A',
      method: 'get',
      path: `/clubs/${A.club}/court-blocks?from=2030-01-01T00:00:00Z&to=2031-01-01T00:00:00Z`,
      route: 'GET /v1/clubs/:clubId/court-blocks',
    },
    {
      name: 'create a court-block in A',
      method: 'post',
      path: `/clubs/${A.club}/court-blocks`,
      body: {
        court_ids: [A.court],
        starts_at: '2030-12-05T10:00:00Z',
        ends_at: '2030-12-05T11:00:00Z',
        kind: 'maintenance',
      },
      route: 'POST /v1/clubs/:clubId/court-blocks',
    },
    {
      name: 'holidays in A',
      method: 'post',
      path: `/clubs/${A.club}/court-blocks/holidays`,
      body: { year: 2030, court_ids: [A.court] },
      route: 'POST /v1/clubs/:clubId/court-blocks/holidays',
    },
    {
      name: 'delete a block of A through the path of B',
      method: 'delete',
      path: `/clubs/${B.club}/court-blocks/${A.block}`,
      route: 'DELETE /v1/clubs/:clubId/court-blocks/:blockId',
    },
    {
      name: 'delete a block of A through the path of A',
      method: 'delete',
      path: `/clubs/${A.club}/court-blocks/${A.block}`,
      route: 'DELETE /v1/clubs/:clubId/court-blocks/:blockId',
    },
    {
      name: 'crm list of A',
      method: 'get',
      path: `/club-admin/players?club_id=${A.club}`,
      route: 'GET /v1/club-admin/players',
    },
    {
      name: 'crm player of A through club A',
      method: 'get',
      path: `/club-admin/players/${A.player}?club_id=${A.club}`,
      route: 'GET /v1/club-admin/players/:userId',
    },
    {
      name: 'crm player of A through club B',
      method: 'get',
      path: `/club-admin/players/${A.player}?club_id=${B.club}`,
      route: 'GET /v1/club-admin/players/:userId',
    },
    {
      name: 'crm notes on a player of A through club B',
      method: 'put',
      path: `/club-admin/players/${A.player}/notes?club_id=${B.club}`,
      body: { tags: [], notes: 'hax' },
      route: 'PUT /v1/club-admin/players/:userId/notes',
    },
    {
      name: 'crm notes on a player of A',
      method: 'put',
      path: `/club-admin/players/${A.player}/notes?club_id=${A.club}`,
      body: { tags: [], notes: 'hax' },
      route: 'PUT /v1/club-admin/players/:userId/notes',
    },
    {
      name: 'how many players starred A',
      method: 'get',
      path: `/club-admin/favorite-count?club_id=${A.club}`,
      route: 'GET /v1/club-admin/favorite-count',
    },
    {
      name: 'match of A',
      method: 'get',
      path: `/matches/${A.match}`,
      route: 'GET /v1/matches/:id',
    },
    {
      name: 'claim a slot in a match of A',
      method: 'post',
      path: `/matches/${A.match}/claim-player`,
      body: { position: 3 },
      route: 'POST /v1/matches/:id/claim-player',
    },
    {
      name: 'correct the score of a match of A',
      method: 'post',
      path: `/matches/${A.match}/score-correction`,
      body: { type: 'final_score', sets: [{ team_1: 6, team_2: 0 }] },
      route: 'POST /v1/matches/:id/score-correction',
    },
    {
      name: 'cancel a booking of A',
      method: 'post',
      path: `/bookings/${A.booking}/cancel`,
      route: 'POST /v1/bookings/:id/cancel',
    },
    {
      name: 'lessons note on a lesson of A',
      method: 'post',
      path: `/lessons/${A.lesson}/notes`,
      body: { text: 'hax' },
      route: 'POST /v1/lessons/:id/notes',
    },
    {
      name: 'accept a lesson request of A',
      method: 'post',
      path: `/lessons/requests/${A.request}/accept`,
      body: {},
      route: 'POST /v1/lessons/requests/:id/accept',
    },
    {
      name: 'reject a lesson request of A',
      method: 'post',
      path: `/lessons/requests/${A.request}/reject`,
      body: {},
      route: 'POST /v1/lessons/requests/:id/reject',
    },
    {
      name: 'cancel a lesson request of A',
      method: 'post',
      path: `/lessons/requests/${A.request}/cancel`,
      body: {},
      route: 'POST /v1/lessons/requests/:id/cancel',
    },
    {
      name: 'tournaments of A',
      method: 'get',
      path: `/clubs/${A.club}/tournaments`,
      route: 'GET /v1/clubs/:id/tournaments',
    },
    {
      name: 'create a tournament in A',
      method: 'post',
      path: `/clubs/${A.club}/tournaments`,
      body: { name: 'hax', category: 4 },
      route: 'POST /v1/clubs/:id/tournaments',
    },
    {
      name: 'tournament of A through club A',
      method: 'get',
      path: `/clubs/${A.club}/tournaments/${A.tournament}`,
      route: 'GET /v1/clubs/:id/tournaments/:tournamentId',
    },
    {
      name: 'tournament of A through club B',
      method: 'get',
      path: `/clubs/${B.club}/tournaments/${A.tournament}`,
      route: 'GET /v1/clubs/:id/tournaments/:tournamentId',
    },
    {
      name: 'register in a tournament of A through club B',
      method: 'post',
      path: `/clubs/${B.club}/tournaments/${A.tournament}/registrations`,
      body: { partner_id: B.staff },
      route: 'POST /v1/clubs/:id/tournaments/:tournamentId/registrations',
    },
    {
      name: 'register in a tournament of A',
      method: 'post',
      path: `/clubs/${A.club}/tournaments/${A.tournament}/registrations`,
      body: { partner_id: B.staff },
      route: 'POST /v1/clubs/:id/tournaments/:tournamentId/registrations',
    },
    {
      name: 'unregister from a tournament of A',
      method: 'delete',
      path: `/clubs/${B.club}/tournaments/${A.tournament}/registrations/${newId()}`,
      route: 'DELETE /v1/clubs/:id/tournaments/:tournamentId/registrations/:registrationId',
    },
    {
      name: 'mark payment in a tournament of A',
      method: 'put',
      path: `/clubs/${B.club}/tournaments/${A.tournament}/registrations/${newId()}/payment`,
      body: { paid: true },
      route: 'PUT /v1/clubs/:id/tournaments/:tournamentId/registrations/:registrationId/payment',
    },
    {
      name: 'draw a tournament of A',
      method: 'post',
      path: `/clubs/${B.club}/tournaments/${A.tournament}/draw`,
      body: {},
      route: 'POST /v1/clubs/:id/tournaments/:tournamentId/draw',
    },
    {
      name: 'result in a tournament of A',
      method: 'put',
      path: `/clubs/${B.club}/tournaments/${A.tournament}/matches/${newId()}/result`,
      body: {},
      route: 'PUT /v1/clubs/:id/tournaments/:tournamentId/matches/:matchId/result',
    },
    {
      name: 'confirm a result in a tournament of A',
      method: 'put',
      path: `/clubs/${B.club}/tournaments/${A.tournament}/matches/${newId()}/result/confirmation`,
      body: {},
      route: 'PUT /v1/clubs/:id/tournaments/:tournamentId/matches/:matchId/result/confirmation',
    },
    {
      name: 'tournament ranking of A',
      method: 'get',
      path: `/clubs/${A.club}/tournament-ranking`,
      route: 'GET /v1/clubs/:id/tournament-ranking',
    },
    {
      name: 'club ranking of A',
      method: 'get',
      path: `/clubs/${A.club}/ranking?category=4`,
      route: 'GET /v1/clubs/:id/ranking',
    },
    {
      name: 'modules of A in the internal console',
      method: 'get',
      path: `/admin/clubs/${A.club}/modules`,
      route: 'GET /v1/admin/clubs/:id/modules',
    },
    {
      name: 'switch modules of A in the internal console',
      method: 'put',
      path: `/admin/clubs/${A.club}/modules`,
      body: { ai_video: true },
      route: 'PUT /v1/admin/clubs/:id/modules',
    },
  ];

  // Routes that are not about one club's resources: listed so the coverage check is explicit.
  const OTHER_ROUTES: Record<string, string> = {
    'GET /v1/clubs': 'club directory (public data), checked below',
    'GET /v1/clubs/:id': 'club directory entry, checked below',
    'GET /v1/courts/:id/availability':
      'public by design: free/busy of a court, no personal data, checked below',
    'POST /v1/bookings': 'a player books any club on purpose; the club comes from the court',
    'GET /v1/lessons': 'own lessons only, checked below',
    'POST /v1/lessons': 'checked below (coach of B cannot schedule in A)',
    'GET /v1/coach/students': 'own students only, checked below',
    'GET /v1/lessons/requests': 'own requests only, checked below',
    'POST /v1/lessons/requests': 'checked below (a request names club and coach)',
    'GET /v1/me/favorite-clubs': 'own favorites only, checked below',
    'PUT /v1/me/favorite-clubs': 'own favorites only, checked below',
    'PUT /v1/me/favorite-clubs/:clubId': 'own favorites only, checked below',
    'DELETE /v1/me/favorite-clubs/:clubId': 'own favorites only, checked below',
    'GET /v1/me/home': 'own favorites and bookings only, checked below',
    'POST /v1/payments/checkout': 'checked below',
    'POST /v1/webhooks/mercadopago': 'signed by the provider, not by a user',
    'POST /v1/auth/otp/whatsapp': 'sign-in',
    'POST /v1/auth/otp/verify': 'sign-in',
    'POST /v1/auth/refresh': 'sign-in',
    'POST /v1/auth/login': 'sign-in',
    'POST /v1/auth/2fa/enroll': 'sign-in (proves the password)',
    'POST /v1/auth/2fa/confirm': 'sign-in (proves the password)',
    'POST /v1/auth/password/forgot': 'sign-in',
    'POST /v1/auth/password/reset': 'sign-in (single-use token)',
    'POST /v1/auth/password/change': 'own credential only; checked in credentials tests',
    'GET /v1/health': 'liveness',
  };

  const asB: [string, string][] = [
    ['owner of B', B.owner],
    ['staff of B', B.staff],
    ['coach of B', B.coach],
    ['player of B', B.player],
  ];

  it('covers every route of the app', async () => {
    const { listAppRoutes } = await import('../contract/routes');
    const routes = listAppRoutes(ctx.app).map((r) => r.key.replace(/\{(\w+)\}/g, ':$1'));
    const known = new Set([...attacks.map((a) => a.route), ...Object.keys(OTHER_ROUTES)]);
    const missing = routes.filter((r) => !known.has(r));
    expect(missing).toEqual([]);
  });

  describe.each(asB)('%s', (_name, user) => {
    it.each(attacks)('$name gets no data and changes nothing', async (attack) => {
      const res = await request(ctx.app.getHttpServer())
        [attack.method](v(attack.path))
        .set('Authorization', `Bearer ${tokens.get(user)}`)
        .send(attack.body);
      // The console (/admin) answers 403 to club users; everything else hides A with 404 or
      // refuses with 403; a body that does not validate may answer 400 first.
      expect(
        attack.body === undefined || Object.keys(attack.body).length > 0
          ? [403, 404]
          : [400, 403, 404],
        `${attack.name}: ${String(res.status)} ${JSON.stringify(res.body)}`,
      ).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toContain(SECRET);
      expect(JSON.stringify(res.body)).not.toContain(A.club.slice(0, 0) + SECRET);
    });
  });

  it('nothing of club A changed after all the attacks', () => {
    const state = psql(
      db.url,
      `SELECT (SELECT count(*) FROM court_blocks WHERE id = '${A.block}')
           || ',' || (SELECT status FROM bookings WHERE id = '${A.booking}')
           || ',' || (SELECT status FROM lesson_requests WHERE id = '${A.request}')
           || ',' || (SELECT count(*) FROM club_player_notes WHERE club_id = '${A.club}')
           || ',' || (SELECT count(*) FROM match_players WHERE match_id = '${A.match}')
           || ',' || (SELECT player_horizon_days FROM clubs WHERE id = '${A.club}')
           || ',' || (SELECT count(*) FROM tournaments WHERE club_id = '${A.club}')
           || ',' || (SELECT count(*) FROM tournament_registrations WHERE club_id = '${A.club}')`,
    );
    expect(state).toBe('1,confirmed,pending,0,2,14,1,0');
  });

  it('requests without a token are refused on every guarded route', async () => {
    for (const attack of attacks) {
      const res = await request(ctx.app.getHttpServer())
        [attack.method](v(attack.path))
        .send(attack.body);
      expect(res.status, attack.name).toBe(401);
    }
  });

  describe('the shared routes', () => {
    const get = (path: string, user: string) =>
      request(ctx.app.getHttpServer())
        .get(v(path))
        .set('Authorization', `Bearer ${tokens.get(user)}`);

    it('the directory shows club A to anyone but never its tax id or payment account', async () => {
      const res = await get(`/clubs/${A.club}`, B.player);
      if (res.status === 200) {
        expect(JSON.stringify(res.body)).not.toContain('30111111118');
        expect(JSON.stringify(res.body)).not.toMatch(/mercadopago|collector/i);
      } else {
        expect([403, 404]).toContain(res.status);
      }
      const list = await get('/clubs', B.owner);
      expect(JSON.stringify(list.body)).not.toContain('30111111118');
    });

    it('the favorites of a player are invisible to everyone else, clubs included', async () => {
      for (const user of [B.player, B.owner, B.staff, B.coach]) {
        for (const path of ['/me/favorite-clubs', '/me/home']) {
          const res = await get(path, user);
          expect(res.body, path).toMatchObject(
            path === '/me/home' ? { favorites: [] } : { items: [] },
          );
        }
      }
      // The owner of A gets a number, not the player.
      const count = await get(`/club-admin/favorite-count?club_id=${A.club}`, A.owner);
      expect(count.body).toEqual({ favorite_count: 1 });
      // Unstarring a club of B for a stranger never touches A's row.
      await request(ctx.app.getHttpServer())
        .delete(v(`/me/favorite-clubs/${A.club}`))
        .set('Authorization', `Bearer ${tokens.get(B.player)}`);
      expect(
        psql(db.url, `SELECT count(*) FROM player_favorite_clubs WHERE user_id = '${A.player}'`),
      ).toBe('1');
    });

    it('own lists never contain club A rows', async () => {
      for (const [path, user] of [
        ['/lessons', B.coach],
        ['/lessons?role=student', B.player],
        ['/coach/students', B.coach],
        ['/lessons/requests', B.player],
        ['/lessons/requests', B.coach],
      ] as const) {
        const res = await get(path, user);
        expect(JSON.stringify(res.body), path).not.toContain(SECRET);
        expect(JSON.stringify(res.body), path).not.toContain(A.lesson);
        expect(JSON.stringify(res.body), path).not.toContain(A.request);
      }
    });

    it('a coach of B cannot schedule a lesson on a court of A, nor can a player request one from A', async () => {
      const lesson = await request(ctx.app.getHttpServer())
        .post(v('/lessons'))
        .set('Authorization', `Bearer ${tokens.get(B.coach)}`)
        .send({
          court_id: A.court,
          starts_at: '2030-12-10T18:00:00Z',
          duration_minutes: 60,
          kind: 'private',
          student_ids: [B.player],
        });
      expect([400, 403, 404]).toContain(lesson.status);
      const lessonRequest = await request(ctx.app.getHttpServer())
        .post(v('/lessons/requests'))
        .set('Authorization', `Bearer ${tokens.get(B.player)}`)
        .send({ club_id: B.club, coach_id: A.coach });
      expect([400, 403, 404, 409, 422]).toContain(lessonRequest.status);
      expect(psql(db.url, `SELECT count(*) FROM lessons WHERE club_id = '${A.club}'`)).toBe('1');
      expect(psql(db.url, `SELECT count(*) FROM lesson_requests WHERE club_id = '${B.club}'`)).toBe(
        '0',
      );
    });

    it('a checkout cannot be made for a booking of club A', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(v('/payments/checkout'))
        .set('Authorization', `Bearer ${tokens.get(B.player)}`)
        .set('Idempotency-Key', newId())
        .send({ concept: 'deposit', booking_id: A.booking });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(psql(db.url, `SELECT count(*) FROM payments WHERE club_id = '${A.club}'`)).toBe('0');
    });

    it('availability is a public free/busy view: it never names who booked', async () => {
      const res = await request(ctx.app.getHttpServer()).get(
        v(`/courts/${A.court}/availability?date=2030-11-01&duration_minutes=90`),
      );
      expect(JSON.stringify(res.body)).not.toContain(A.player);
      expect(JSON.stringify(res.body)).not.toContain(SECRET);
    });
  });
});
