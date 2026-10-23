// Pure rules of a tournament (CL-08): groups, round robin, knockout bracket, standings and
// ranking points. No database, no clock: the service feeds these functions and stores the result.

export interface SeededPair {
  id: string;
  /** Average rating of the two players; higher is stronger. */
  strength: number;
  /** Registration order, the tie-break between equal strengths. */
  order: number;
}

export interface GroupPlan {
  index: number;
  pairIds: string[];
}

/** Number of groups for `pairCount` pairs (groups of 3 or 4), or null when no split works. */
export function groupCount(pairCount: number): number | null {
  if (pairCount < 3) return null;
  const groups = Math.ceil(pairCount / 4);
  return 3 * groups <= pairCount ? groups : null;
}

/** Strongest first; equal strengths keep registration order. */
export function rankPairs(pairs: readonly SeededPair[]): SeededPair[] {
  return [...pairs].sort((a, b) => b.strength - a.strength || a.order - b.order);
}

/**
 * Groups of 3 or 4 with the seeds spread in a snake: the best `g` pairs head the groups, the
 * next `g` go back the other way, and so on. Returns null when the count cannot be split.
 */
export function buildGroups(pairs: readonly SeededPair[]): GroupPlan[] | null {
  const g = groupCount(pairs.length);
  if (g === null) return null;
  const groups: GroupPlan[] = Array.from({ length: g }, (_, index) => ({ index, pairIds: [] }));
  const base = Math.floor(pairs.length / g);
  const larger = pairs.length % g;
  // Groups at the front take the extra pair, so the best seeds fill them first.
  const sizes = groups.map((_, i) => (i < larger ? base + 1 : base));
  let row = 0;
  const ranked = rankPairs(pairs);
  let cursor = 0;
  while (cursor < ranked.length) {
    const order = row % 2 === 0 ? [...groups] : [...groups].reverse();
    for (const group of order) {
      const next = ranked[cursor];
      if (next === undefined) break;
      if (group.pairIds.length < (sizes[group.index] ?? 0)) {
        group.pairIds.push(next.id);
        cursor += 1;
      }
    }
    row += 1;
  }
  return groups;
}

export interface RoundRobinMatch {
  round: number;
  a: string;
  b: string;
}

/** Every pair plays every other once; in one round no pair plays twice (circle method). */
export function roundRobin(pairIds: readonly string[]): RoundRobinMatch[] {
  const slots: (string | null)[] = [...pairIds];
  if (slots.length % 2 === 1) slots.push(null);
  const n = slots.length;
  const out: RoundRobinMatch[] = [];
  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = slots[i];
      const b = slots[n - 1 - i];
      if (a && b) out.push({ round: round + 1, a, b });
    }
    // Keep the first slot fixed and rotate the rest.
    const last = slots.pop();
    if (last !== undefined) slots.splice(1, 0, last);
  }
  return out;
}

export type KnockoutStage = 'round_of_16' | 'quarter' | 'semi' | 'final';

export const STAGE_BY_SIZE: Record<number, KnockoutStage> = {
  16: 'round_of_16',
  8: 'quarter',
  4: 'semi',
  2: 'final',
};

export interface BracketNode {
  /** Position inside the bracket, `${stage}:${n}`. */
  key: string;
  stage: KnockoutStage;
  /** Pair ids of the first round (null = bye or not known yet). */
  a: string | null;
  b: string | null;
  /** Node that receives the winner and the side it takes. */
  next: { key: string; side: 'a' | 'b' } | null;
}

/** Standard bracket order: seed 1 meets the last seed, 2 the second to last, halves apart. */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const total = order.length * 2 + 1;
    order = order.flatMap((s) => [s, total - s]);
  }
  return order;
}

function sameGroupConflicts(
  pairs: readonly (readonly [string | null, string | null])[],
  groupOf: ReadonlyMap<string, number>,
): number {
  return pairs.filter(([a, b]) => a && b && groupOf.get(a) === groupOf.get(b)).length;
}

/**
 * Knockout bracket for the top two of every group. Group winners are seeds 1..g and runners-up
 * g+1..2g; byes go to the best seeds. The runners-up order that avoids a rematch of a group in
 * the first round is the one used. `winners` and `runnersUp` are indexed by group.
 */
export function buildBracket(
  winners: readonly string[],
  runnersUp: readonly string[],
): BracketNode[] {
  const qualified = winners.length + runnersUp.length;
  let size = 2;
  while (size < qualified) size *= 2;
  const groupOf = new Map<string, number>();
  winners.forEach((id, i) => groupOf.set(id, i));
  runnersUp.forEach((id, i) => groupOf.set(id, i));

  const layout = (runners: readonly string[]): (readonly [string | null, string | null])[] => {
    const seeds = [...winners, ...runners];
    const order = seedOrder(size);
    const out: (readonly [string | null, string | null])[] = [];
    for (let i = 0; i < order.length; i += 2) {
      out.push([seeds[(order[i] ?? 0) - 1] ?? null, seeds[(order[i + 1] ?? 0) - 1] ?? null]);
    }
    return out;
  };
  const natural = layout(runnersUp);
  const reversed = layout([...runnersUp].reverse());
  const first =
    sameGroupConflicts(reversed, groupOf) < sameGroupConflicts(natural, groupOf)
      ? reversed
      : natural;

  const nodes: BracketNode[] = [];
  let count = size / 2;
  let stageSize = size;
  while (stageSize >= 2) {
    const stage = STAGE_BY_SIZE[stageSize];
    if (!stage) throw new Error(`Unsupported bracket size ${stageSize}`);
    for (let n = 0; n < count; n++) {
      const pair = stageSize === size ? first[n] : undefined;
      const parent = stageSize > 2 ? Math.floor(n / 2) : -1;
      nodes.push({
        key: `${stage}:${n}`,
        stage,
        a: pair?.[0] ?? null,
        b: pair?.[1] ?? null,
        next:
          parent < 0
            ? null
            : {
                key: `${STAGE_BY_SIZE[stageSize / 2] ?? 'final'}:${parent}`,
                side: n % 2 === 0 ? 'a' : 'b',
              },
      });
    }
    count /= 2;
    stageSize /= 2;
  }
  return nodes;
}

export interface SetResult {
  team_1: number;
  team_2: number;
}

export interface ResultRow {
  /** Pair on side `a` / `b` of the match. */
  a: string;
  b: string;
  sets: readonly SetResult[];
  winner: 'a' | 'b';
}

export interface Standing {
  pairId: string;
  played: number;
  wins: number;
  setsFor: number;
  setsAgainst: number;
  gamesFor: number;
  gamesAgainst: number;
}

/** Table of a group from its confirmed matches: wins, then set difference, then game difference. */
export function standings(pairIds: readonly string[], results: readonly ResultRow[]): Standing[] {
  const table = new Map<string, Standing>(
    pairIds.map((pairId) => [
      pairId,
      { pairId, played: 0, wins: 0, setsFor: 0, setsAgainst: 0, gamesFor: 0, gamesAgainst: 0 },
    ]),
  );
  for (const r of results) {
    const a = table.get(r.a);
    const b = table.get(r.b);
    if (!a || !b) continue;
    a.played += 1;
    b.played += 1;
    (r.winner === 'a' ? a : b).wins += 1;
    for (const s of r.sets) {
      a.gamesFor += s.team_1;
      a.gamesAgainst += s.team_2;
      b.gamesFor += s.team_2;
      b.gamesAgainst += s.team_1;
      if (s.team_1 > s.team_2) {
        a.setsFor += 1;
        b.setsAgainst += 1;
      } else {
        b.setsFor += 1;
        a.setsAgainst += 1;
      }
    }
  }
  const index = new Map(pairIds.map((id, i) => [id, i]));
  return [...table.values()].sort(
    (x, y) =>
      y.wins - x.wins ||
      y.setsFor - y.setsAgainst - (x.setsFor - x.setsAgainst) ||
      y.gamesFor - y.gamesAgainst - (x.gamesFor - x.gamesAgainst) ||
      (index.get(x.pairId) ?? 0) - (index.get(y.pairId) ?? 0),
  );
}

/** Points a tournament gives to the ranking; the club may change them when it creates one. */
export interface PointsConfig {
  champion: number;
  finalist: number;
  semifinal: number;
  quarterfinal: number;
  group_win: number;
}

/** Defaults of the spec (CL-08). The final values are the owner's decision (open). */
export const DEFAULT_POINTS: PointsConfig = {
  champion: 100,
  finalist: 60,
  semifinal: 36,
  quarterfinal: 18,
  group_win: 5,
};

export interface PointsInput {
  /** Winner of every confirmed group match. */
  groupWins: readonly string[];
  /** Confirmed knockout matches: stage, winner and loser pair. */
  knockout: readonly { stage: KnockoutStage; winner: string; loser: string }[];
}

/** Points per pair: the best round reached plus 5 (default) per group win. */
export function pairPoints(input: PointsInput, config: PointsConfig): Map<string, number> {
  const out = new Map<string, number>();
  const add = (id: string, n: number) => out.set(id, (out.get(id) ?? 0) + n);
  for (const id of input.groupWins) add(id, config.group_win);
  for (const m of input.knockout) {
    if (m.stage === 'final') {
      add(m.winner, config.champion);
      add(m.loser, config.finalist);
    } else if (m.stage === 'semi') add(m.loser, config.semifinal);
    else if (m.stage === 'quarter') add(m.loser, config.quarterfinal);
  }
  return out;
}

export interface Interval {
  start: number;
  end: number;
}

export interface MatchToPlace {
  key: string;
  /** Matches of one stage start only after the previous stage ended. */
  stageIndex: number;
  pairs: readonly string[];
}

export interface Placement {
  key: string;
  courtId: string;
  startsAt: number;
  endsAt: number;
}

/**
 * Greedy timetable: each match takes the earliest slot in the window (every `minutes`) on a
 * court that is free and where none of its pairs plays at the same time. A stage never starts
 * before the previous one ended. Returns null if some match does not fit the window.
 */
export function schedule(
  matches: readonly MatchToPlace[],
  options: {
    courtIds: readonly string[];
    windowStart: number;
    windowEnd: number;
    minutes: number;
    /** Intervals already taken on each court (other bookings, blocks). */
    busy: ReadonlyMap<string, readonly Interval[]>;
  },
): Placement[] | null {
  const length = options.minutes * 60_000;
  const taken = new Map<string, Interval[]>(
    options.courtIds.map((c) => [c, [...(options.busy.get(c) ?? [])]]),
  );
  const pairBusy = new Map<string, Interval[]>();
  const overlaps = (list: readonly Interval[] | undefined, s: number, e: number) =>
    (list ?? []).some((i) => i.start < e && s < i.end);
  const out: Placement[] = [];
  const stageEnd = new Map<number, number>();
  const ordered = [...matches].sort((x, y) => x.stageIndex - y.stageIndex);
  for (const m of ordered) {
    let earliest = options.windowStart;
    if (m.stageIndex > 0) {
      for (const [idx, end] of stageEnd) if (idx < m.stageIndex) earliest = Math.max(earliest, end);
    }
    let placed: Placement | null = null;
    for (let s = earliest; s + length <= options.windowEnd && !placed; s += length) {
      if (m.pairs.some((p) => overlaps(pairBusy.get(p), s, s + length))) continue;
      const court = options.courtIds.find((c) => !overlaps(taken.get(c), s, s + length));
      if (court) placed = { key: m.key, courtId: court, startsAt: s, endsAt: s + length };
    }
    if (!placed) return null;
    taken.get(placed.courtId)?.push({ start: placed.startsAt, end: placed.endsAt });
    for (const p of m.pairs)
      pairBusy.set(p, [...(pairBusy.get(p) ?? []), { start: placed.startsAt, end: placed.endsAt }]);
    stageEnd.set(m.stageIndex, Math.max(stageEnd.get(m.stageIndex) ?? 0, placed.endsAt));
    out.push(placed);
  }
  return out;
}
