import type { Schema } from '@app/contracts';

import { DEFAULT_POINTS, validSets } from '@/lib/club-tournaments/model';

/**
 * Club tournaments mock: `/clubs/{id}/tournaments...` and `/clubs/{id}/tournament-ranking`. Only
 * reached through `createMockFetch` when `NEXT_PUBLIC_API_MOCK` is on (never in production). The
 * mock draws for 3-4, 6-8 or 12-16 pairs (1, 2 or 4 groups, so the knockout is a full bracket);
 * the real API handles any count. Entries made by staff are stored already confirmed.
 */
type Detail = Schema<'TournamentDetail'>;
type Match = Schema<'TournamentMatch'>;
type Reply = (status: number, body: unknown) => Response;

export interface ClubTournamentsMockState {
  clubId: string;
  enabled: boolean;
  tournaments: Detail[];
  seq: number;
}

const id = (state: ClubTournamentsMockState) =>
  `01928f6e-7c1a-7d4e-9b3a-${String(++state.seq).padStart(12, '0')}`;

const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Facundo', 'Gala', 'Hugo'];
const LAST = ['Torres', 'Páez', 'Ruiz', 'Gómez', 'Sosa', 'Vera', 'Luna', 'Mora'];

export function newClubTournamentsMockState(
  clubId: string,
  enabled = true,
): ClubTournamentsMockState {
  const state: ClubTournamentsMockState = { clubId, enabled, tournaments: [], seq: 9000 };
  const pairs: Schema<'TournamentPair'>[] = Array.from({ length: 8 }, (_, n) => ({
    id: id(state),
    players: [0, 1].map((k) => ({
      user_id: id(state),
      name: `${FIRST[(n + k * 3) % 8]} ${LAST[(n * 2 + k) % 8]}`,
    })),
    seed: null,
    group_id: null,
    paid: n % 2 === 0,
  }));
  state.tournaments.push({
    id: id(state),
    club_id: clubId,
    name: 'Torneo Apertura 4ª',
    category: 4,
    status: 'registration',
    entry_fee_cents: 1_500_000,
    match_minutes: 90,
    points: DEFAULT_POINTS,
    pair_count: pairs.length,
    pairs,
    groups: [],
    matches: [],
  });
  return state;
}

const summary = ({ pairs: _p, groups: _g, matches: _m, ...t }: Detail): Schema<'Tournament'> => t;

function standings(t: Detail, pairIds: string[], groupId: string): Schema<'TournamentStanding'>[] {
  const rows = pairIds.map((pair_id) => ({
    pair_id,
    played: 0,
    wins: 0,
    sets_for: 0,
    sets_against: 0,
    games_for: 0,
    games_against: 0,
  }));
  for (const m of t.matches.filter((x) => x.group_id === groupId && x.status === 'confirmed')) {
    const a = rows.find((r) => r.pair_id === m.pair_a_id);
    const b = rows.find((r) => r.pair_id === m.pair_b_id);
    if (!a || !b || !m.sets) continue;
    for (const s of m.sets) {
      a.games_for += s.team_1;
      a.games_against += s.team_2;
      b.games_for += s.team_2;
      b.games_against += s.team_1;
      const aWon = s.team_1 > s.team_2;
      a.sets_for += aWon ? 1 : 0;
      a.sets_against += aWon ? 0 : 1;
      b.sets_for += aWon ? 0 : 1;
      b.sets_against += aWon ? 1 : 0;
    }
    a.played += 1;
    b.played += 1;
    if (m.winner_pair_id === a.pair_id) a.wins += 1;
    else b.wins += 1;
  }
  return rows.sort(
    (x, y) =>
      y.wins - x.wins ||
      y.sets_for - y.sets_against - (x.sets_for - x.sets_against) ||
      y.games_for - y.games_against - (x.games_for - x.games_against),
  );
}

function refresh(t: Detail) {
  for (const g of t.groups) g.standings = standings(t, g.pair_ids, g.id);
}

const nextStage = { quarter: 'semi', semi: 'final' } as const;

/** Fill the first knockout round once the groups are done, and carry winners forward. */
function advance(t: Detail) {
  refresh(t);
  const groupMatches = t.matches.filter((m) => m.stage === 'group');
  if (groupMatches.every((m) => m.status === 'confirmed')) {
    const first = t.matches.filter((m) => m.stage !== 'group')[0]?.stage;
    const slots = t.matches.filter((m) => m.stage === first);
    const top = (pos: number, rank: number) => t.groups[pos]?.standings[rank]?.pair_id ?? null;
    const g = t.groups.length;
    const pairing: [number, number, number, number][] =
      g === 1
        ? [[0, 0, 0, 1]]
        : g === 2
          ? [
              [0, 0, 1, 1],
              [1, 0, 0, 1],
            ]
          : [
              [0, 0, 1, 1],
              [2, 0, 3, 1],
              [1, 0, 0, 1],
              [3, 0, 2, 1],
            ];
    slots.forEach((m, n) => {
      const p = pairing[n];
      if (p && m.pair_a_id === null) {
        m.pair_a_id = top(p[0], p[1]);
        m.pair_b_id = top(p[2], p[3]);
      }
    });
  }
  for (const m of t.matches.filter((x) => x.stage !== 'group' && x.stage !== 'final')) {
    const to = nextStage[m.stage as 'quarter' | 'semi'];
    if (!to || m.status !== 'confirmed') continue;
    const ofStage = t.matches.filter((x) => x.stage === m.stage);
    const target = t.matches.filter((x) => x.stage === to)[Math.floor(ofStage.indexOf(m) / 2)];
    if (target) {
      if (ofStage.indexOf(m) % 2 === 0) target.pair_a_id = m.winner_pair_id;
      else target.pair_b_id = m.winner_pair_id;
    }
  }
}

function award(t: Detail): Map<string, number> {
  const pts = new Map<string, number>();
  const give = (pairId: string | null, n: number) => {
    const pair = t.pairs.find((p) => p.id === pairId);
    for (const p of pair?.players ?? []) {
      pts.set(p.user_id, Math.max(pts.get(p.user_id) ?? 0, 0) + n);
    }
  };
  for (const m of t.matches.filter((x) => x.stage === 'group'))
    give(m.winner_pair_id, t.points.group_win);
  const final = t.matches.find((m) => m.stage === 'final');
  const loser = (m?: Match) =>
    (m?.pair_a_id === m?.winner_pair_id ? m?.pair_b_id : m?.pair_a_id) ?? null;
  give(final?.winner_pair_id ?? null, t.points.champion);
  give(loser(final), t.points.finalist);
  for (const m of t.matches.filter((x) => x.stage === 'semi')) give(loser(m), t.points.semifinal);
  for (const m of t.matches.filter((x) => x.stage === 'quarter'))
    give(loser(m), t.points.quarterfinal);
  return pts;
}

function build(
  t: Detail,
  courts: string[],
  start: number,
  end: number,
  state: ClubTournamentsMockState,
) {
  const n = t.pairs.length;
  const g = [1, 2, 4].find((x) => 3 * x <= n && n <= 4 * x);
  if (!g) return 'count';
  const ranked = [...t.pairs];
  ranked.forEach((p, k) => (p.seed = k + 1));
  const groups: Schema<'TournamentGroup'>[] = Array.from({ length: g }, (_, position) => ({
    id: id(state),
    position,
    pair_ids: [],
    standings: [],
  }));
  ranked.forEach((p, k) => {
    const row = Math.floor(k / g);
    const grp = groups[row % 2 === 0 ? k % g : g - 1 - (k % g)];
    if (grp) {
      grp.pair_ids.push(p.id);
      p.group_id = grp.id;
    }
  });
  const specs: Pick<Match, 'stage' | 'group_id' | 'round' | 'pair_a_id' | 'pair_b_id'>[] = [];
  for (const grp of groups) {
    const ids = grp.pair_ids;
    const rounds =
      ids.length === 3
        ? [
            [0, 1],
            [0, 2],
            [1, 2],
          ]
        : [
            [0, 1],
            [2, 3],
            [0, 2],
            [1, 3],
            [0, 3],
            [1, 2],
          ];
    rounds.forEach(([a, b], r) =>
      specs.push({
        stage: 'group',
        group_id: grp.id,
        round: Math.floor(r / (ids.length === 3 ? 1 : 2)) + 1,
        pair_a_id: ids[a ?? 0] ?? null,
        pair_b_id: ids[b ?? 0] ?? null,
      }),
    );
  }
  const ko: Schema<'TournamentStage'>[] =
    g === 1
      ? ['final']
      : g === 2
        ? ['semi', 'semi', 'final']
        : ['quarter', 'quarter', 'quarter', 'quarter', 'semi', 'semi', 'final'];
  ko.forEach((stage, r) =>
    specs.push({ stage, group_id: null, round: r + 1, pair_a_id: null, pair_b_id: null }),
  );
  const ms = t.match_minutes * 60_000;
  const perCourt = Math.floor((end - start) / ms);
  if (perCourt * courts.length < specs.length) return 'slots';
  t.pairs.forEach((p) => p);
  t.groups = groups;
  t.matches = specs.map((s, k) => ({
    id: id(state),
    ...s,
    court_id: courts[k % courts.length] ?? '',
    starts_at: new Date(start + Math.floor(k / courts.length) * ms).toISOString(),
    ends_at: new Date(start + (Math.floor(k / courts.length) + 1) * ms).toISOString(),
    status: 'scheduled',
    sets: null,
    winner_pair_id: null,
    reported_by_user_id: null,
  }));
  t.status = 'in_progress';
  refresh(t);
  return null;
}

export async function handleClubTournamentsRequest(
  request: Request,
  state: ClubTournamentsMockState,
  reply: Reply,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^.*\/v1/, '');
  const m = /^\/clubs\/([^/]+)\/(tournaments|tournament-ranking)(?:\/([^/]+)(?:\/(.+))?)?$/.exec(
    path,
  );
  if (!m) return null;
  const fail = (status: number, code: Schema<'ErrorCode'>, message: string) =>
    reply(status, { code, message } satisfies Schema<'Error'>);
  if (m[1] !== state.clubId) return fail(404, 'NOT_FOUND', 'club');
  if (!state.enabled) return fail(403, 'CLUB_FEATURE_DISABLED', 'tournaments');
  const method = request.method;

  if (m[2] === 'tournament-ranking') {
    const category = Number(url.searchParams.get('category'));
    const totals = new Map<string, { name: string; points: number; n: number }>();
    for (const t of state.tournaments.filter(
      (x) => x.status === 'finished' && x.category === category,
    )) {
      for (const [uid, points] of award(t)) {
        const name = t.pairs.flatMap((p) => p.players).find((p) => p.user_id === uid)?.name ?? '';
        const row = totals.get(uid) ?? { name, points: 0, n: 0 };
        totals.set(uid, { name, points: row.points + points, n: row.n + 1 });
      }
    }
    const entries = [...totals.entries()]
      .sort((a, b) => b[1].points - a[1].points)
      .map(([user_id, r], k) => ({
        position: k + 1,
        user_id,
        name: r.name,
        points: r.points,
        tournaments: r.n,
        is_me: false,
      }));
    return reply(200, { club_id: state.clubId, category, window_months: 12, entries });
  }

  if (!m[3]) {
    if (method === 'GET')
      return reply(200, { items: [...state.tournaments].reverse().map(summary) });
    if (method === 'POST') {
      const body = (await request.json()) as Schema<'TournamentCreate'>;
      if (
        !body.name?.trim() ||
        body.name.length > 80 ||
        !(body.category >= 1 && body.category <= 6)
      ) {
        return fail(400, 'VALIDATION_FAILED', 'tournament');
      }
      const created: Detail = {
        id: id(state),
        club_id: state.clubId,
        name: body.name,
        category: body.category,
        status: 'registration',
        entry_fee_cents: body.entry_fee_cents ?? 0,
        match_minutes: body.match_minutes ?? 90,
        points: body.points ?? DEFAULT_POINTS,
        pair_count: 0,
        pairs: [],
        groups: [],
        matches: [],
      };
      state.tournaments.push(created);
      return reply(201, summary(created));
    }
    return null;
  }

  const t = state.tournaments.find((x) => x.id === m[3]);
  if (!t) return fail(404, 'NOT_FOUND', 'tournament');
  const rest = m[4] ?? '';
  if (rest === '' && method === 'GET') return reply(200, t);

  const pay = /^registrations\/([^/]+)\/payment$/.exec(rest);
  if (pay && method === 'PUT') {
    const pair = t.pairs.find((p) => p.id === pay[1]);
    if (!pair) return fail(404, 'NOT_FOUND', 'pair');
    pair.paid = true;
    return reply(200, pair);
  }
  const unreg = /^registrations\/([^/]+)$/.exec(rest);
  if (unreg && method === 'DELETE') {
    if (t.status !== 'registration') return fail(409, 'TOURNAMENT_REGISTRATION_CLOSED', 'closed');
    if (!t.pairs.some((p) => p.id === unreg[1])) return fail(404, 'NOT_FOUND', 'pair');
    t.pairs = t.pairs.filter((p) => p.id !== unreg[1]);
    t.pair_count = t.pairs.length;
    return new Response(null, { status: 204 });
  }
  if (rest === 'draw' && method === 'POST') {
    const body = (await request.json()) as Schema<'TournamentDraw'>;
    if (t.status !== 'registration') return fail(409, 'TOURNAMENT_REGISTRATION_CLOSED', 'drawn');
    const start = Date.parse(body.window_starts_at);
    const end = Date.parse(body.window_ends_at);
    if (!body.court_ids?.length || !(start < end)) return fail(400, 'VALIDATION_FAILED', 'window');
    const problem = build(t, body.court_ids, start, end, state);
    if (problem === 'count') return fail(422, 'TOURNAMENT_PAIR_COUNT_INVALID', 'pairs');
    if (problem === 'slots') return fail(422, 'TOURNAMENT_NOT_ENOUGH_SLOTS', 'slots');
    return reply(200, t);
  }
  const res = /^matches\/([^/]+)\/result(\/confirmation)?$/.exec(rest);
  if (res && method === 'PUT') {
    const match = t.matches.find((x) => x.id === res[1]);
    if (!match) return fail(404, 'NOT_FOUND', 'match');
    if (match.status === 'confirmed' || !match.pair_a_id || !match.pair_b_id) {
      return fail(409, 'INVALID_STATE_TRANSITION', 'state');
    }
    if (!res[2]) {
      const body = (await request.json()) as Schema<'TournamentResult'>;
      if (!Array.isArray(body.sets) || !validSets(body.sets))
        return fail(400, 'VALIDATION_FAILED', 'sets');
      match.sets = body.sets;
      const one = body.sets.filter((s) => s.team_1 > s.team_2).length;
      match.winner_pair_id = one === 2 ? match.pair_a_id : match.pair_b_id;
    } else if (match.status !== 'awaiting_confirmation') {
      return fail(409, 'INVALID_STATE_TRANSITION', 'state');
    }
    match.status = 'confirmed';
    advance(t);
    if (t.matches.find((x) => x.stage === 'final')?.status === 'confirmed') t.status = 'finished';
    return reply(200, t);
  }
  return null;
}
