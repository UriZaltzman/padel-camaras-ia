import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POINTS,
  buildBracket,
  buildGroups,
  groupCount,
  pairPoints,
  roundRobin,
  schedule,
  seedOrder,
  standings,
  type SeededPair,
} from '../../src/tournaments/tournament-draw';

const pairs = (n: number): SeededPair[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${String(i + 1)}`,
    strength: 2000 - i * 10,
    order: i,
  }));

describe('groupCount', () => {
  it('splits into groups of 3 or 4, or refuses', () => {
    expect([2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 16].map((n) => groupCount(n))).toEqual([
      null,
      1,
      1,
      null,
      2,
      2,
      2,
      3,
      3,
      4,
      4,
    ]);
  });
});

describe('buildGroups', () => {
  it('spreads the seeds in a snake and keeps sizes 3 or 4', () => {
    const groups = buildGroups(pairs(10)) ?? [];
    expect(groups.map((g) => g.pairIds.length)).toEqual([4, 3, 3]);
    expect(groups.map((g) => g.pairIds[0])).toEqual(['p1', 'p2', 'p3']);
    // second row goes back the other way
    expect(groups.map((g) => g.pairIds[1])).toEqual(['p6', 'p5', 'p4']);
    expect(new Set(groups.flatMap((g) => g.pairIds)).size).toBe(10);
  });

  it('returns null when the count cannot be split', () => {
    expect(buildGroups(pairs(5))).toBeNull();
  });
});

describe('roundRobin', () => {
  it.each([3, 4])('every pair meets every other once, no pair twice per round (%i)', (n) => {
    const ids = pairs(n).map((p) => p.id);
    const out = roundRobin(ids);
    expect(out).toHaveLength((n * (n - 1)) / 2);
    const seen = new Set(out.map((m) => [m.a, m.b].sort().join('-')));
    expect(seen.size).toBe(out.length);
    for (const round of new Set(out.map((m) => m.round))) {
      const inRound = out.filter((m) => m.round === round).flatMap((m) => [m.a, m.b]);
      expect(new Set(inRound).size).toBe(inRound.length);
    }
  });
});

describe('buildBracket', () => {
  it('meets winners and runners-up of different groups in the first round (4 groups)', () => {
    const w = ['w0', 'w1', 'w2', 'w3'];
    const r = ['r0', 'r1', 'r2', 'r3'];
    const nodes = buildBracket(w, r);
    const quarters = nodes.filter((n) => n.stage === 'quarter');
    expect(quarters).toHaveLength(4);
    for (const q of quarters) {
      expect(q.a?.slice(1)).not.toBe(q.b?.slice(1));
      expect(q.a?.[0]).not.toBe(q.b?.[0]);
    }
    expect(nodes.filter((n) => n.stage === 'semi')).toHaveLength(2);
    expect(nodes.filter((n) => n.stage === 'final')).toHaveLength(1);
    expect(nodes.find((n) => n.key === 'quarter:0')?.next).toEqual({ key: 'semi:0', side: 'a' });
  });

  it('gives byes to the best seeds with 3 groups', () => {
    const nodes = buildBracket(['w0', 'w1', 'w2'], ['r0', 'r1', 'r2']);
    const byes = nodes.filter((n) => n.stage === 'quarter' && (n.a === null || n.b === null));
    expect(byes).toHaveLength(2);
    expect(
      byes
        .flatMap((n) => [n.a, n.b])
        .filter(Boolean)
        .sort(),
    ).toEqual(['w0', 'w1']);
  });

  it('a single group plays the final directly', () => {
    const nodes = buildBracket(['w0'], ['r0']);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ stage: 'final', a: 'w0', b: 'r0', next: null });
  });

  it('seed order follows the standard bracket', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe('standings', () => {
  const set = (a: number, b: number) => ({ team_1: a, team_2: b });
  it('orders by wins, then set difference, then game difference', () => {
    const table = standings(
      ['a', 'b', 'c'],
      [
        { a: 'a', b: 'b', sets: [set(6, 4), set(6, 4)], winner: 'a' },
        { a: 'b', b: 'c', sets: [set(6, 0), set(6, 0)], winner: 'a' },
        { a: 'c', b: 'a', sets: [set(6, 4), set(4, 6), set(6, 3)], winner: 'a' },
      ],
    );
    // a, b and c each have one win... c beats a, a beats b, b beats c
    expect(table.map((s) => s.wins)).toEqual([1, 1, 1]);
    expect(table.map((s) => s.pairId)).toEqual(['a', 'b', 'c']);
  });
});

describe('pairPoints', () => {
  it('adds the best round reached and 5 per group win', () => {
    const out = pairPoints(
      {
        groupWins: ['a', 'a', 'b', 'c'],
        knockout: [
          { stage: 'quarter', winner: 'a', loser: 'x' },
          { stage: 'semi', winner: 'a', loser: 'b' },
          { stage: 'final', winner: 'a', loser: 'c' },
        ],
      },
      DEFAULT_POINTS,
    );
    expect(out.get('a')).toBe(110);
    expect(out.get('c')).toBe(65);
    expect(out.get('b')).toBe(41);
    expect(out.get('x')).toBe(18);
  });
});

describe('schedule', () => {
  const HOUR = 3_600_000;
  it('never double books a court or a pair and keeps stages in order', () => {
    const ids = pairs(8).map((p) => p.id);
    const matches = roundRobin(ids.slice(0, 4)).map((m, i) => ({
      key: `m${String(i)}`,
      stageIndex: 0,
      pairs: [m.a, m.b],
    }));
    matches.push({ key: 'final', stageIndex: 1, pairs: [] });
    const out = schedule(matches, {
      courtIds: ['c1', 'c2'],
      windowStart: 0,
      windowEnd: 10 * HOUR,
      minutes: 60,
      busy: new Map([['c1', [{ start: 0, end: HOUR }]]]),
    });
    expect(out).not.toBeNull();
    const placed = out ?? [];
    for (const [i, x] of placed.entries()) {
      for (const y of placed.slice(i + 1)) {
        const overlap = x.startsAt < y.endsAt && y.startsAt < x.endsAt;
        if (overlap) expect(x.courtId).not.toBe(y.courtId);
      }
    }
    const last = placed.find((p) => p.key === 'final');
    expect(last?.startsAt).toBeGreaterThanOrEqual(
      Math.max(...placed.filter((p) => p.key !== 'final').map((p) => p.endsAt)),
    );
    expect(placed.find((p) => p.courtId === 'c1')?.startsAt).toBeGreaterThanOrEqual(HOUR);
  });

  it('returns null when the window is too small', () => {
    const out = schedule(
      [
        { key: 'a', stageIndex: 0, pairs: ['x', 'y'] },
        { key: 'b', stageIndex: 0, pairs: ['x', 'z'] },
      ],
      { courtIds: ['c1'], windowStart: 0, windowEnd: HOUR, minutes: 60, busy: new Map() },
    );
    expect(out).toBeNull();
  });
});
