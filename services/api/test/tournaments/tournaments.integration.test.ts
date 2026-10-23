import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionService } from '../../src/auth/session/session.service';
import { newId } from '../../src/db/ids';
import { adminUrl, createScratchDb, psql } from '../db/scratch-db';
import { createTestApp } from '../helpers';

interface Match {
  id: string;
  stage: string;
  pair_a_id: string | null;
  pair_b_id: string | null;
  court_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  winner_pair_id: string | null;
}
interface Pair {
  id: string;
  players: { user_id: string }[];
}
interface Detail {
  status: string;
  pairs: Pair[];
  groups: { pair_ids: string[] }[];
  matches: Match[];
}

// Tournaments against a real Postgres: the courts are booked under the exclusion constraint,
// rows are scoped by club, and the points land in the ranking.
describe.skipIf(!adminUrl)('tournaments (CL-08)', () => {
  const db = adminUrl ? createScratchDb('tournaments') : { url: '', drop: () => undefined };
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const club = newId();
  const closedClub = newId();
  const courts = [newId(), newId(), newId(), newId()];
  const owner = newId();
  const outsider = newId();
  const players = Array.from({ length: 32 }, () => newId());
  const tokens = new Map<string, string>();

  beforeAll(async () => {
    psql(
      db.url,
      `INSERT INTO clubs (id, name, plan, updated_at) VALUES ('${club}', 'Club', 'loan', now()), ('${closedClub}', 'Sin torneos', 'loan', now());
       INSERT INTO club_modules (club_id, tournaments, updated_at) VALUES ('${club}', true, now());
       ${courts.map((c, i) => `INSERT INTO courts (id, club_id, name, updated_at) VALUES ('${c}', '${club}', 'Cancha ${String(i + 1)}', now());`).join('\n')}
       INSERT INTO users (id, name, updated_at) VALUES ('${owner}', 'Olga', now()), ('${outsider}', 'Otto', now());
       ${players.map((p, i) => `INSERT INTO users (id, name, updated_at) VALUES ('${p}', 'Jugador ${String(i + 1).padStart(2, '0')}', now());`).join('\n')}
       INSERT INTO memberships (id, club_id, user_id, role, updated_at) VALUES
         ('${newId()}', '${club}', '${owner}', 'owner', now()),
         ('${newId()}', '${closedClub}', '${outsider}', 'owner', now()),
         ${players.map((p) => `('${newId()}', '${club}', '${p}', 'player', now())`).join(',\n')};`,
    );
    ctx = await createTestApp([], { databaseUrl: db.url });
    const sessions = ctx.app.get(SessionService);
    for (const id of [owner, outsider, ...players]) {
      tokens.set(id, (await sessions.issue(id)).access_token);
    }
  }, 60_000);

  afterAll(async () => {
    await ctx.app.close();
    db.drop();
  });

  const call = (
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    who: string,
    body?: object,
  ) => {
    const r = request(ctx.app.getHttpServer())
      [method](`/v1${path}`)
      .set('Authorization', `Bearer ${tokens.get(who)}`);
    return body ? r.send(body) : r;
  };
  const base = `/clubs/${club}/tournaments`;
  let tournament = '';
  const sets = (a: number, b: number) => ({
    sets: [
      { team_1: 6, team_2: 3 },
      { team_1: a, team_2: b },
    ],
  });

  it('keeps tournaments off for a club without the module', async () => {
    const res = await call('get', `/clubs/${closedClub}/tournaments`, outsider);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CLUB_FEATURE_DISABLED');
  });

  it('lets only staff create, and hides the club from outsiders', async () => {
    expect(
      (await call('post', base, players[0] as string, { name: 'Abierto', category: 4 })).status,
    ).toBe(403);
    expect((await call('get', base, outsider)).status).toBe(404);
    const res = await call('post', base, owner, {
      name: 'Abierto de primavera',
      category: 4,
      entry_fee_cents: 500000,
    });
    expect(res.status).toBe(201);
    expect(res.body.points).toEqual({
      champion: 100,
      finalist: 60,
      semifinal: 36,
      quarterfinal: 18,
      group_win: 5,
    });
    tournament = res.body.id as string;
  });

  it('registers 16 pairs and refuses a player who is already in a pair', async () => {
    for (let i = 0; i < 16; i++) {
      const res = await call(
        'post',
        `${base}/${tournament}/registrations`,
        players[2 * i] as string,
        {
          partner_user_id: players[2 * i + 1],
        },
      );
      expect(res.status).toBe(201);
      expect(res.body.paid).toBe(false);
    }
    const taken = await call('post', `${base}/${tournament}/registrations`, players[0] as string, {
      partner_user_id: players[1],
    });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('TOURNAMENT_PLAYER_TAKEN');
  }, 60_000);

  it('refuses a draw that does not fit the courts and stores nothing', async () => {
    const res = await call('post', `${base}/${tournament}/draw`, owner, {
      court_ids: [courts[0]],
      window_starts_at: '2026-11-07T11:00:00Z',
      window_ends_at: '2026-11-07T20:00:00Z',
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('TOURNAMENT_NOT_ENOUGH_SLOTS');
    expect(psql(db.url, `SELECT count(*) FROM bookings WHERE origin = 'tournament'`)).toBe('0');
    expect((await call('get', `${base}/${tournament}`, owner)).body.status).toBe('registration');
  });

  let detail: Detail;
  it('draws 4 groups of 4 and books 31 matches without a clash', async () => {
    const res = await call('post', `${base}/${tournament}/draw`, owner, {
      court_ids: courts,
      window_starts_at: '2026-11-07T11:00:00Z',
      window_ends_at: '2026-11-08T01:00:00Z',
    });
    expect(res.status).toBe(200);
    detail = res.body as Detail;
    expect(detail.status).toBe('in_progress');
    expect(detail.groups.map((g) => g.pair_ids.length)).toEqual([4, 4, 4, 4]);
    expect(detail.matches).toHaveLength(31);
    expect(detail.matches.filter((m) => m.stage === 'group')).toHaveLength(24);
    expect(detail.matches.filter((m) => m.stage === 'quarter')).toHaveLength(4);
    expect(
      psql(
        db.url,
        `SELECT count(*) FROM bookings WHERE origin = 'tournament' AND status = 'confirmed'`,
      ),
    ).toBe('31');

    const at = (m: Match) => [Date.parse(m.starts_at), Date.parse(m.ends_at)] as const;
    for (const [i, x] of detail.matches.entries()) {
      for (const y of detail.matches.slice(i + 1)) {
        const [xs, xe] = at(x);
        const [ys, ye] = at(y);
        if (xs < ye && ys < xe) {
          expect(x.court_id).not.toBe(y.court_id);
          const pairsX = [x.pair_a_id, x.pair_b_id].filter(Boolean);
          expect(pairsX.some((p) => p === y.pair_a_id || p === y.pair_b_id)).toBe(false);
        }
      }
    }
    // Knockout rounds start after every group match ended.
    const groupEnd = Math.max(
      ...detail.matches.filter((m) => m.stage === 'group').map((m) => at(m)[1]),
    );
    for (const m of detail.matches.filter((x) => x.stage !== 'group'))
      expect(at(m)[0]).toBeGreaterThanOrEqual(groupEnd);
  }, 60_000);

  it('closes registration after the draw', async () => {
    const res = await call(
      'delete',
      `${base}/${tournament}/registrations/${detail.pairs[0]?.id}`,
      players[0] as string,
    );
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TOURNAMENT_REGISTRATION_CLOSED');
  });

  it('needs the rival to confirm a result a player entered', async () => {
    const m = detail.matches.find((x) => x.stage === 'group') as Match;
    const a = detail.pairs.find((p) => p.id === m.pair_a_id) as Pair;
    const b = detail.pairs.find((p) => p.id === m.pair_b_id) as Pair;
    const path = `${base}/${tournament}/matches/${m.id}/result`;
    expect((await call('put', path, outsider, sets(6, 4))).status).toBe(404);
    expect(
      (
        await call('put', path, a.players[0]?.user_id as string, {
          sets: [
            { team_1: 6, team_2: 6 },
            { team_1: 6, team_2: 2 },
          ],
        })
      ).status,
    ).toBe(400);
    const reported = await call('put', path, a.players[0]?.user_id as string, sets(6, 4));
    expect(reported.status).toBe(200);
    const row = (reported.body as Detail).matches.find((x) => x.id === m.id);
    expect(row).toMatchObject({ status: 'awaiting_confirmation', winner_pair_id: a.id });
    // The pair that entered it cannot confirm its own result.
    expect(
      (await call('put', `${path}/confirmation`, a.players[1]?.user_id as string)).status,
    ).toBe(403);
    const confirmed = await call('put', `${path}/confirmation`, b.players[0]?.user_id as string);
    expect(confirmed.status).toBe(200);
    expect((confirmed.body as Detail).matches.find((x) => x.id === m.id)?.status).toBe('confirmed');
    expect(
      (await call('put', `${path}/confirmation`, b.players[0]?.user_id as string)).status,
    ).toBe(409);
  }, 60_000);

  it('plays the whole tournament and gives the ranking points', async () => {
    let state = (await call('get', `${base}/${tournament}`, owner)).body as Detail;
    for (let guard = 0; guard < 40 && state.status === 'in_progress'; guard++) {
      const next = state.matches.find(
        (m) => m.status !== 'confirmed' && m.pair_a_id && m.pair_b_id,
      );
      if (!next) break;
      const res = await call(
        'put',
        `${base}/${tournament}/matches/${next.id}/result`,
        owner,
        sets(6, 4),
      );
      expect(res.status).toBe(200);
      state = res.body as Detail;
    }
    expect(state.status).toBe('finished');
    expect(state.matches.every((m) => m.status === 'confirmed')).toBe(true);

    const final = state.matches.find((m) => m.stage === 'final') as Match;
    const champion = state.pairs.find((p) => p.id === final.winner_pair_id) as Pair;
    const finalist = state.pairs.find(
      (p) =>
        p.id === (final.winner_pair_id === final.pair_a_id ? final.pair_b_id : final.pair_a_id),
    ) as Pair;
    const wins = (pairId: string) =>
      state.matches.filter((m) => m.stage === 'group' && m.winner_pair_id === pairId).length;

    const ranking = await call(
      'get',
      `/clubs/${club}/tournament-ranking?category=4`,
      champion.players[0]?.user_id as string,
    );
    expect(ranking.status).toBe(200);
    const entries = ranking.body.entries as {
      user_id: string;
      points: number;
      is_me: boolean;
      position: number;
    }[];
    const pointsOf = (u: string) => entries.find((e) => e.user_id === u)?.points;
    expect(pointsOf(champion.players[0]?.user_id as string)).toBe(100 + 5 * wins(champion.id));
    expect(pointsOf(finalist.players[1]?.user_id as string)).toBe(60 + 5 * wins(finalist.id));
    expect(entries[0]?.position).toBe(1);
    expect(entries.filter((e) => e.is_me)).toHaveLength(1);
    // Another category has no points.
    const other = await call('get', `/clubs/${club}/tournament-ranking?category=2`, owner);
    expect(other.body.entries).toEqual([]);
  }, 60_000);

  it('has row level security on every tournament table', () => {
    const on = psql(
      db.url,
      `SELECT count(*) FROM pg_class WHERE relrowsecurity AND relname IN ('tournaments', 'tournament_groups', 'tournament_registrations', 'tournament_matches', 'tournament_points')`,
    );
    expect(on).toBe('5');
  });

  it('keeps another club out of the tournament', async () => {
    expect((await call('get', `/clubs/${club}/tournaments/${tournament}`, outsider)).status).toBe(
      404,
    );
  });
});
