import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { AccessIdentity } from '../auth/session/session.service';
import { MembershipsRepository } from '../clubs/memberships.repository';
import { strongestRole } from '../clubs/permissions';
import { CLOCK, type Clock } from '../common/clock';
import { parseInput } from '../common/zod';
import type { DbContext } from '../db/db-context';
import { newId } from '../db/ids';
import { AppError } from '../errors/app-error';
import { setLogContext } from '../logging/request-context';
import { winnerOf } from '../matches/score';
import { RATING_CONFIG } from '../ratings/rating-config';
import {
  DEFAULT_POINTS,
  buildBracket,
  buildGroups,
  groupCount,
  pairPoints,
  roundRobin,
  schedule,
  standings,
  type BracketNode,
  type KnockoutStage,
  type MatchToPlace,
  type PointsConfig,
  type ResultRow,
  type SeededPair,
  type SetResult,
  type Standing,
} from './tournament-draw';
import {
  TournamentsRepository,
  type Confirmation,
  type DrawPlan,
  type GroupRow,
  type MatchRow,
  type PairRow,
  type TournamentRow,
} from './tournaments.repository';

/** Months of tournaments the ranking adds up. */
export const TOURNAMENT_RANKING_MONTHS = 12;

const points = z.strictObject({
  champion: z.number().int().min(0).max(1000),
  finalist: z.number().int().min(0).max(1000),
  semifinal: z.number().int().min(0).max(1000),
  quarterfinal: z.number().int().min(0).max(1000),
  group_win: z.number().int().min(0).max(1000),
});
const createSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  category: z.number().int().min(1).max(6),
  entry_fee_cents: z.number().int().min(0).max(100_000_000).default(0),
  match_minutes: z.number().int().min(30).max(180).default(90),
  points: points.default(DEFAULT_POINTS),
});
const registerSchema = z.strictObject({ partner_user_id: z.uuid() });
const drawSchema = z.strictObject({
  court_ids: z.array(z.uuid()).min(1).max(20),
  window_starts_at: z.iso.datetime({ offset: true }),
  window_ends_at: z.iso.datetime({ offset: true }),
});
const set = z.strictObject({
  team_1: z.number().int().min(0).max(7),
  team_2: z.number().int().min(0).max(7),
});
const resultSchema = z.strictObject({ sets: z.array(set).min(2).max(3) });
const categorySchema = z.coerce.number().int().min(1).max(6);

export interface TournamentDto {
  id: string;
  club_id: string;
  name: string;
  category: number;
  status: TournamentRow['status'];
  entry_fee_cents: number;
  match_minutes: number;
  points: PointsConfig;
  pair_count: number;
}

export interface PairDto {
  id: string;
  players: { user_id: string; name: string }[];
  seed: number | null;
  group_id: string | null;
  paid: boolean;
}

export interface MatchDto {
  id: string;
  stage: MatchRow['stage'];
  group_id: string | null;
  round: number;
  pair_a_id: string | null;
  pair_b_id: string | null;
  court_id: string;
  starts_at: string;
  ends_at: string;
  status: MatchRow['status'];
  sets: SetResult[] | null;
  winner_pair_id: string | null;
  reported_by_user_id: string | null;
}

export interface TournamentDetailDto extends TournamentDto {
  pairs: PairDto[];
  groups: {
    id: string;
    position: number;
    pair_ids: string[];
    standings: {
      pair_id: string;
      played: number;
      wins: number;
      sets_for: number;
      sets_against: number;
      games_for: number;
      games_against: number;
    }[];
  }[];
  matches: MatchDto[];
}

export interface TournamentRankingDto {
  club_id: string;
  category: number;
  window_months: number;
  entries: {
    position: number;
    user_id: string;
    name: string;
    points: number;
    tournaments: number;
    is_me: boolean;
  }[];
}

interface Actor {
  staff: boolean;
  userId: string;
  db: DbContext;
}

const KNOCKOUT_ORDER: readonly KnockoutStage[] = ['round_of_16', 'quarter', 'semi', 'final'];

function toTournamentDto(t: TournamentRow): TournamentDto {
  return {
    id: t.id,
    club_id: t.clubId,
    name: t.name,
    category: t.category,
    status: t.status,
    entry_fee_cents: t.entryFeeCents,
    match_minutes: t.matchMinutes,
    points: t.points,
    pair_count: t.pairCount,
  };
}

function toPairDto(p: PairRow): PairDto {
  return {
    id: p.id,
    players: p.players.map((x) => ({ user_id: x.userId, name: x.name })),
    seed: p.seed,
    group_id: p.groupId,
    paid: p.paid,
  };
}

function toMatchDto(m: MatchRow): MatchDto {
  return {
    id: m.id,
    stage: m.stage,
    group_id: m.groupId,
    round: m.round,
    pair_a_id: m.pairAId,
    pair_b_id: m.pairBId,
    court_id: m.courtId,
    starts_at: m.startsAt.toISOString(),
    ends_at: m.endsAt.toISOString(),
    status: m.status,
    sets: m.sets,
    winner_pair_id: m.winnerPairId,
    reported_by_user_id: m.reportedByUserId,
  };
}

/** Confirmed matches as rows for the table, from the point of view of side `a`. */
function resultRows(matches: readonly MatchRow[]): ResultRow[] {
  return matches.flatMap((m) =>
    m.status === 'confirmed' && m.pairAId && m.pairBId && m.sets && m.winnerPairId
      ? [
          {
            a: m.pairAId,
            b: m.pairBId,
            sets: m.sets,
            winner: m.winnerPairId === m.pairAId ? ('a' as const) : ('b' as const),
          },
        ]
      : [],
  );
}

function knockoutKey(m: MatchRow): string | null {
  return m.bracketKey;
}

@Injectable()
export class TournamentsService {
  constructor(
    private readonly repo: TournamentsRepository,
    private readonly memberships: MembershipsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Staff and owner act with their role; any other participant acts as a player. */
  private async actor(auth: AccessIdentity, clubId: string): Promise<Actor> {
    const role = strongestRole(await this.memberships.activeRoles(auth.userId, clubId));
    setLogContext({ club_id: clubId });
    if (role === 'owner' || role === 'staff') {
      return { staff: true, userId: auth.userId, db: { role, userId: auth.userId, clubId } };
    }
    // Not part of the club: same answer as a club that does not exist.
    if (role === null && !(await this.repo.isParticipant(auth.userId, clubId))) {
      throw new AppError('NOT_FOUND');
    }
    // Players act through the system role after this check; rows stay scoped to the club.
    return {
      staff: false,
      userId: auth.userId,
      db: { role: 'system', userId: auth.userId, clubId },
    };
  }

  private requireStaff(actor: Actor): void {
    if (!actor.staff) throw new AppError('FORBIDDEN');
  }

  private async tournament(actor: Actor, clubId: string, id: string): Promise<TournamentRow> {
    const t = await this.repo.find(actor.db, clubId, parseInput(z.uuid(), id));
    if (!t) throw new AppError('NOT_FOUND');
    return t;
  }

  async list(auth: AccessIdentity, clubId: string): Promise<{ items: TournamentDto[] }> {
    const actor = await this.actor(auth, clubId);
    return { items: (await this.repo.list(actor.db, clubId)).map(toTournamentDto) };
  }

  async create(auth: AccessIdentity, clubId: string, body: unknown): Promise<TournamentDto> {
    const actor = await this.actor(auth, clubId);
    this.requireStaff(actor);
    const input = parseInput(createSchema, body);
    const row = {
      id: newId(),
      clubId,
      name: input.name,
      category: input.category,
      entryFeeCents: input.entry_fee_cents,
      matchMinutes: input.match_minutes,
      points: input.points,
      createdByUserId: auth.userId,
    };
    await this.repo.create(actor.db, row);
    return toTournamentDto({ ...row, status: 'registration', pairCount: 0 });
  }

  async get(auth: AccessIdentity, clubId: string, id: string): Promise<TournamentDetailDto> {
    const actor = await this.actor(auth, clubId);
    return this.detail(actor, await this.tournament(actor, clubId, id));
  }

  private async detail(actor: Actor, t: TournamentRow): Promise<TournamentDetailDto> {
    const [pairs, groups, matches] = await Promise.all([
      this.repo.pairs(actor.db, t.id),
      this.repo.groups(actor.db, t.id),
      this.repo.matches(actor.db, t.id),
    ]);
    const confirmed = resultRows(matches.filter((m) => m.stage === 'group'));
    return {
      ...toTournamentDto({ ...t, pairCount: pairs.length }),
      pairs: pairs.map(toPairDto),
      groups: groups.map((g) => {
        const ids = pairs.filter((p) => p.groupId === g.id).map((p) => p.id);
        const table = standings(
          ids,
          confirmed.filter((r) => ids.includes(r.a)),
        );
        return {
          id: g.id,
          position: g.position,
          pair_ids: ids,
          standings: table.map((s) => ({
            pair_id: s.pairId,
            played: s.played,
            wins: s.wins,
            sets_for: s.setsFor,
            sets_against: s.setsAgainst,
            games_for: s.gamesFor,
            games_against: s.gamesAgainst,
          })),
        };
      }),
      matches: matches.map(toMatchDto),
    };
  }

  async register(
    auth: AccessIdentity,
    clubId: string,
    id: string,
    body: unknown,
  ): Promise<PairDto> {
    const actor = await this.actor(auth, clubId);
    const t = await this.tournament(actor, clubId, id);
    const input = parseInput(registerSchema, body);
    if (input.partner_user_id === auth.userId) {
      throw new AppError('VALIDATION_FAILED', {
        issues: [{ path: ['partner_user_id'], message: 'same_player' }],
      });
    }
    if (t.status !== 'registration') throw new AppError('TOURNAMENT_REGISTRATION_CLOSED');
    const found = await this.repo.users(actor.db, [auth.userId, input.partner_user_id]);
    const me = found.find((u) => u.userId === auth.userId);
    const partner = found.find((u) => u.userId === input.partner_user_id);
    if (!me || !partner) {
      throw new AppError('VALIDATION_FAILED', {
        issues: [{ path: ['partner_user_id'], message: 'unknown_player' }],
      });
    }
    const pair = {
      id: newId(),
      tournamentId: t.id,
      player1UserId: auth.userId,
      player2UserId: partner.userId,
      createdByUserId: auth.userId,
    };
    const outcome = await this.repo.addPair(actor.db, pair);
    if (outcome === 'closed') throw new AppError('TOURNAMENT_REGISTRATION_CLOSED');
    if (outcome === 'taken') throw new AppError('TOURNAMENT_PLAYER_TAKEN');
    return {
      id: pair.id,
      players: [
        { user_id: me.userId, name: me.name },
        { user_id: partner.userId, name: partner.name },
      ],
      seed: null,
      group_id: null,
      paid: t.entryFeeCents === 0,
    };
  }

  async withdraw(auth: AccessIdentity, clubId: string, id: string, pairId: string): Promise<void> {
    const actor = await this.actor(auth, clubId);
    const t = await this.tournament(actor, clubId, id);
    const pair = (await this.repo.pairs(actor.db, t.id)).find(
      (p) => p.id === parseInput(z.uuid(), pairId),
    );
    if (!pair) throw new AppError('NOT_FOUND');
    if (!actor.staff && !pair.players.some((p) => p.userId === auth.userId))
      throw new AppError('FORBIDDEN');
    const outcome = await this.repo.withdraw(actor.db, pair.id, this.clock.now());
    if (outcome === 'closed') throw new AppError('TOURNAMENT_REGISTRATION_CLOSED');
    if (outcome === 'missing') throw new AppError('NOT_FOUND');
  }

  async markPaid(
    auth: AccessIdentity,
    clubId: string,
    id: string,
    pairId: string,
  ): Promise<PairDto> {
    const actor = await this.actor(auth, clubId);
    this.requireStaff(actor);
    const t = await this.tournament(actor, clubId, id);
    const pair = (await this.repo.pairs(actor.db, t.id)).find(
      (p) => p.id === parseInput(z.uuid(), pairId),
    );
    if (!pair) throw new AppError('NOT_FOUND');
    if (!pair.paid) await this.repo.markPaid(actor.db, pair.id, this.clock.now());
    return toPairDto({ ...pair, paid: true });
  }

  async draw(
    auth: AccessIdentity,
    clubId: string,
    id: string,
    body: unknown,
  ): Promise<TournamentDetailDto> {
    const actor = await this.actor(auth, clubId);
    this.requireStaff(actor);
    const t = await this.tournament(actor, clubId, id);
    const input = parseInput(drawSchema, body);
    const windowStart = Date.parse(input.window_starts_at);
    const windowEnd = Date.parse(input.window_ends_at);
    if (!(windowEnd > windowStart)) {
      throw new AppError('VALIDATION_FAILED', {
        issues: [{ path: ['window_ends_at'], message: 'before_start' }],
      });
    }
    if (t.status !== 'registration') throw new AppError('TOURNAMENT_REGISTRATION_CLOSED');
    const pairs = await this.repo.pairs(actor.db, t.id);
    if (groupCount(pairs.length) === null)
      throw new AppError('TOURNAMENT_PAIR_COUNT_INVALID', { pairs: pairs.length });
    const courtIds = [...new Set(input.court_ids)];
    const active = await this.repo.activeCourts(actor.db, clubId, courtIds);
    if (active.length !== courtIds.length) {
      throw new AppError('VALIDATION_FAILED', {
        issues: [{ path: ['court_ids'], message: 'unknown_court' }],
      });
    }

    const users = await this.repo.users(
      actor.db,
      pairs.flatMap((p) => p.players.map((x) => x.userId)),
    );
    const rating = new Map(users.map((u) => [u.userId, u.rating ?? RATING_CONFIG.defaultRating]));
    const seeded: SeededPair[] = pairs.map((p, order) => ({
      id: p.id,
      order,
      strength:
        p.players.reduce(
          (sum, x) => sum + (rating.get(x.userId) ?? RATING_CONFIG.defaultRating),
          0,
        ) / 2,
    }));
    const groups = buildGroups(seeded);
    if (!groups) throw new AppError('TOURNAMENT_PAIR_COUNT_INVALID', { pairs: pairs.length });

    const groupIds = groups.map(() => newId());
    const seedOf = new Map(
      [...seeded]
        .sort((a, b) => b.strength - a.strength || a.order - b.order)
        .map((p, i) => [p.id, i + 1]),
    );
    const todo: (MatchToPlace & {
      build: (p: {
        courtId: string;
        startsAt: number;
        endsAt: number;
      }) => DrawPlan['matches'][number];
    })[] = [];
    const rounds = groups.flatMap((g) => roundRobin(g.pairIds).map((m) => ({ g, m })));
    rounds.sort((x, y) => x.m.round - y.m.round || x.g.index - y.g.index);
    for (const [n, { g, m }] of rounds.entries()) {
      todo.push({
        key: `group:${String(n)}`,
        stageIndex: 0,
        pairs: [m.a, m.b],
        build: (p) => ({
          id: newId(),
          stage: 'group',
          groupId: groupIds[g.index] ?? null,
          round: m.round,
          bracketKey: null,
          pairAId: m.a,
          pairBId: m.b,
          nextMatchId: null,
          nextSide: null,
          createdByUserId: auth.userId,
          courtId: p.courtId,
          startsAt: new Date(p.startsAt),
          endsAt: new Date(p.endsAt),
        }),
      });
    }
    // The bracket's shape depends only on the number of groups; real pairs come after the groups.
    const nodes = buildBracket(
      groups.map((_, i) => `w${String(i)}`),
      groups.map((_, i) => `r${String(i)}`),
    );
    const real = nodes.filter(
      (n) => n.stage !== firstStage(nodes) || (n.a !== null && n.b !== null),
    );
    const matchIdOf = new Map(real.map((n) => [n.key, newId()]));
    for (const n of real) {
      todo.push({
        key: n.key,
        stageIndex: 1 + KNOCKOUT_ORDER.indexOf(n.stage),
        pairs: [],
        build: (p) => ({
          id: matchIdOf.get(n.key) ?? newId(),
          stage: n.stage,
          groupId: null,
          round: Number(n.key.split(':')[1]),
          bracketKey: n.key,
          pairAId: null,
          pairBId: null,
          nextMatchId: n.next ? (matchIdOf.get(n.next.key) ?? null) : null,
          nextSide: n.next?.side ?? null,
          createdByUserId: auth.userId,
          courtId: p.courtId,
          startsAt: new Date(p.startsAt),
          endsAt: new Date(p.endsAt),
        }),
      });
    }

    const busyList = await this.repo.busy(
      actor.db,
      courtIds,
      new Date(windowStart),
      new Date(windowEnd),
    );
    const busy = new Map(
      [...busyList].map(([c, list]) => [c, list.map((i) => ({ start: i.start, end: i.end }))]),
    );
    const placed = schedule(todo, {
      courtIds,
      windowStart,
      windowEnd,
      minutes: t.matchMinutes,
      busy,
    });
    if (!placed) throw new AppError('TOURNAMENT_NOT_ENOUGH_SLOTS', { matches: todo.length });
    const slotOf = new Map(placed.map((p) => [p.key, p]));

    const plan: DrawPlan = {
      tournamentId: t.id,
      pairs: groups.flatMap((g) =>
        g.pairIds.map((pid) => ({
          id: pid,
          strength: seeded.find((s) => s.id === pid)?.strength ?? 0,
          seed: seedOf.get(pid) ?? 0,
          groupId: groupIds[g.index] ?? '',
        })),
      ),
      groups: groups.map((g) => ({ id: groupIds[g.index] ?? '', position: g.index })),
      matches: todo.map((m) =>
        m.build(slotOf.get(m.key) ?? { courtId: '', startsAt: 0, endsAt: 0 }),
      ),
    };
    const outcome = await this.repo.applyDraw(actor.db, plan, auth.userId);
    if (outcome === 'closed') throw new AppError('TOURNAMENT_REGISTRATION_CLOSED');
    if (outcome === 'slots')
      throw new AppError('TOURNAMENT_NOT_ENOUGH_SLOTS', { matches: todo.length });
    return this.detail(actor, { ...t, status: 'in_progress' });
  }

  async report(
    auth: AccessIdentity,
    clubId: string,
    id: string,
    matchId: string,
    body: unknown,
  ): Promise<TournamentDetailDto> {
    const actor = await this.actor(auth, clubId);
    const t = await this.tournament(actor, clubId, id);
    const input = parseInput(resultSchema, body);
    const { match, pairs } = await this.loadMatch(actor, t, matchId);
    if (
      t.status !== 'in_progress' ||
      match.status === 'confirmed' ||
      !match.pairAId ||
      !match.pairBId
    ) {
      throw new AppError('INVALID_STATE_TRANSITION');
    }
    const mine = this.sideOf(match, pairs, auth.userId);
    if (!actor.staff && !mine) throw new AppError('FORBIDDEN');
    const winner = winnerOf(input.sets, { bestOfSets: 3, superTiebreak: false });
    if (winner === null) {
      throw new AppError('VALIDATION_FAILED', {
        issues: [{ path: ['sets'], message: 'impossible_score' }],
      });
    }
    const winnerPairId = winner === 1 ? match.pairAId : match.pairBId;
    const stored = await this.repo.report(actor.db, {
      matchId: match.id,
      sets: input.sets,
      winnerPairId,
      reportedByUserId: auth.userId,
    });
    if (!stored) throw new AppError('INVALID_STATE_TRANSITION');
    if (actor.staff) {
      // The club's staff enters results already confirmed.
      await this.applyConfirmation(
        actor,
        t,
        { ...match, sets: input.sets, winnerPairId, status: 'awaiting_confirmation' },
        auth.userId,
      );
    }
    return this.detail(actor, await this.tournament(actor, clubId, id));
  }

  async confirm(
    auth: AccessIdentity,
    clubId: string,
    id: string,
    matchId: string,
  ): Promise<TournamentDetailDto> {
    const actor = await this.actor(auth, clubId);
    const t = await this.tournament(actor, clubId, id);
    const { match, pairs } = await this.loadMatch(actor, t, matchId);
    if (
      t.status !== 'in_progress' ||
      match.status !== 'awaiting_confirmation' ||
      !match.sets ||
      !match.winnerPairId
    ) {
      throw new AppError('INVALID_STATE_TRANSITION');
    }
    if (!actor.staff) {
      const mine = this.sideOf(match, pairs, auth.userId);
      const reporter = this.sideOf(match, pairs, match.reportedByUserId ?? '');
      // Only the rival of whoever entered the result confirms it.
      if (!mine || mine === reporter) throw new AppError('FORBIDDEN');
    }
    await this.applyConfirmation(actor, t, match, auth.userId);
    return this.detail(actor, await this.tournament(actor, clubId, id));
  }

  private async loadMatch(actor: Actor, t: TournamentRow, matchId: string) {
    const [matches, pairs] = await Promise.all([
      this.repo.matches(actor.db, t.id),
      this.repo.pairs(actor.db, t.id),
    ]);
    const match = matches.find((m) => m.id === parseInput(z.uuid(), matchId));
    if (!match) throw new AppError('NOT_FOUND');
    return { match, pairs };
  }

  private sideOf(match: MatchRow, pairs: readonly PairRow[], userId: string): 'a' | 'b' | null {
    const inPair = (pairId: string | null) =>
      pairs.find((p) => p.id === pairId)?.players.some((x) => x.userId === userId) ?? false;
    if (inPair(match.pairAId)) return 'a';
    if (inPair(match.pairBId)) return 'b';
    return null;
  }

  /** Confirms `match` and moves the tournament forward: next round, qualified pairs, points. */
  private async applyConfirmation(
    actor: Actor,
    t: TournamentRow,
    match: MatchRow,
    byUserId: string,
  ): Promise<void> {
    if (!match.sets || !match.winnerPairId) throw new AppError('INVALID_STATE_TRANSITION');
    const [all, pairs, groups] = await Promise.all([
      this.repo.matches(actor.db, t.id),
      this.repo.pairs(actor.db, t.id),
      this.repo.groups(actor.db, t.id),
    ]);
    const confirmedNow = all.map((m) =>
      m.id === match.id
        ? { ...m, status: 'confirmed' as const, sets: match.sets, winnerPairId: match.winnerPairId }
        : m,
    );
    const slots: Confirmation['slots'] = [];
    let finish: Confirmation['finish'] = null;

    if (match.stage === 'group') {
      const groupMatches = confirmedNow.filter((m) => m.stage === 'group');
      if (groupMatches.every((m) => m.status === 'confirmed')) {
        slots.push(...qualifiedSlots(groups, pairs, groupMatches, confirmedNow));
      }
    } else if (match.nextMatchId && match.nextSide) {
      slots.push({ matchId: match.nextMatchId, side: match.nextSide, pairId: match.winnerPairId });
    } else if (match.stage === 'final') {
      finish = { points: playerPoints(t, pairs, confirmedNow) };
    }
    const ok = await this.repo.confirm(
      actor.db,
      {
        matchId: match.id,
        tournamentId: t.id,
        confirmedByUserId: byUserId,
        sets: match.sets,
        winnerPairId: match.winnerPairId,
        slots,
        finish,
      },
      this.clock.now(),
    );
    if (!ok) throw new AppError('INVALID_STATE_TRANSITION');
  }

  async ranking(
    auth: AccessIdentity,
    clubId: string,
    categoryInput: unknown,
  ): Promise<TournamentRankingDto> {
    const actor = await this.actor(auth, clubId);
    const category = parseInput(categorySchema, categoryInput);
    const since = this.clock.now();
    since.setUTCMonth(since.getUTCMonth() - TOURNAMENT_RANKING_MONTHS);
    const rows = await this.repo.ranking(actor.db, clubId, category, since);
    const ordered = rows
      .filter((r) => r.points > 0)
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.tournaments - a.tournaments ||
          a.name.localeCompare(b.name) ||
          a.userId.localeCompare(b.userId),
      )
      .slice(0, 50);
    return {
      club_id: clubId,
      category,
      window_months: TOURNAMENT_RANKING_MONTHS,
      entries: ordered.map((r, i) => ({
        position: i + 1,
        user_id: r.userId,
        name: r.name,
        points: r.points,
        tournaments: r.tournaments,
        is_me: r.userId === auth.userId,
      })),
    };
  }
}

function firstStage(nodes: readonly BracketNode[]): KnockoutStage {
  const first = nodes[0];
  if (!first) throw new Error('Empty bracket');
  return first.stage;
}

/** Winners and runners-up of every group into the first knockout round (byes move on). */
function qualifiedSlots(
  groups: readonly GroupRow[],
  pairs: readonly PairRow[],
  groupMatches: readonly MatchRow[],
  all: readonly MatchRow[],
): Confirmation['slots'] {
  const ordered = [...groups].sort((a, b) => a.position - b.position);
  const winners: string[] = [];
  const runnersUp: string[] = [];
  const results = resultRows(groupMatches);
  for (const g of ordered) {
    const ids = pairs.filter((p) => p.groupId === g.id).map((p) => p.id);
    const table: Standing[] = standings(
      ids,
      results.filter((r) => ids.includes(r.a)),
    );
    winners.push(table[0]?.pairId ?? '');
    runnersUp.push(table[1]?.pairId ?? '');
  }
  const byKey = new Map(all.filter((m) => knockoutKey(m)).map((m) => [knockoutKey(m), m]));
  const slots: Confirmation['slots'] = [];
  for (const node of buildBracket(winners, runnersUp)) {
    if (node.stage !== firstStage(buildBracket(winners, runnersUp))) continue;
    const row = byKey.get(node.key);
    if (row && node.a && node.b) {
      slots.push(
        { matchId: row.id, side: 'a', pairId: node.a },
        { matchId: row.id, side: 'b', pairId: node.b },
      );
    } else if (node.next && (node.a ?? node.b)) {
      // Bye: the only pair goes straight to the next round.
      const next = byKey.get(node.next.key);
      if (next)
        slots.push({
          matchId: next.id,
          side: node.next.side,
          pairId: (node.a ?? node.b) as string,
        });
    }
  }
  return slots;
}

/** Points per player once the final is confirmed. */
function playerPoints(
  t: TournamentRow,
  pairs: readonly PairRow[],
  matches: readonly MatchRow[],
): { userId: string; points: number }[] {
  const confirmed = matches.filter(
    (m) => m.status === 'confirmed' && m.winnerPairId && m.pairAId && m.pairBId,
  );
  const byPair = pairPoints(
    {
      groupWins: confirmed.filter((m) => m.stage === 'group').map((m) => m.winnerPairId as string),
      knockout: confirmed
        .filter((m): m is MatchRow & { stage: KnockoutStage } => m.stage !== 'group')
        .map((m) => ({
          stage: m.stage,
          winner: m.winnerPairId as string,
          loser: (m.winnerPairId === m.pairAId ? m.pairBId : m.pairAId) as string,
        })),
    },
    t.points,
  );
  return pairs.flatMap((p) =>
    p.players
      .map((x) => ({ userId: x.userId, points: byPair.get(p.id) ?? 0 }))
      .filter((x) => x.points > 0),
  );
}
