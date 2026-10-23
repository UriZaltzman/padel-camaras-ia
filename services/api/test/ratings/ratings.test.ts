import { describe, expect, it } from 'vitest';
import { updateRating } from '../../src/ratings/glicko2';
import { categoryForRating, startingRating, teamScore } from '../../src/ratings/rating-config';
import {
  RatingsRepository,
  type PlayerRating,
  type RatedMatch,
  type RatingUpdate,
} from '../../src/ratings/ratings.repository';
import { RatingsService, rateMatch } from '../../src/ratings/ratings.service';

describe('glicko2', () => {
  it('matches the reference example from Glickman (2013)', () => {
    const next = updateRating(
      { rating: 1500, deviation: 200, volatility: 0.06 },
      [
        { rating: 1400, deviation: 30, score: 1 },
        { rating: 1550, deviation: 100, score: 0 },
        { rating: 1700, deviation: 300, score: 0 },
      ],
      0.5,
    );
    expect(next.rating).toBeCloseTo(1464.06, 1);
    expect(next.deviation).toBeCloseTo(151.52, 1);
    expect(next.volatility).toBeCloseTo(0.05999, 4);
  });

  it('only grows the deviation without results', () => {
    const next = updateRating({ rating: 1500, deviation: 200, volatility: 0.06 }, [], 0.5);
    expect(next.rating).toBe(1500);
    expect(next.deviation).toBeGreaterThan(200);
  });
});

describe('categories', () => {
  it('maps ratings to categories at the cuts', () => {
    expect(categoryForRating(1000)).toBe('cat_8');
    expect(categoryForRating(1299)).toBe('cat_8');
    expect(categoryForRating(1300)).toBe('cat_7');
    expect(categoryForRating(1599)).toBe('cat_5');
    expect(categoryForRating(1900)).toBe('cat_1');
    expect(categoryForRating(2500)).toBe('cat_1');
  });

  it('starts in the middle of the declared category', () => {
    expect(startingRating('cat_5')).toBe(1550);
    expect(startingRating('cat_4')).toBe(1650);
    expect(startingRating('cat_8')).toBe(1250);
    expect(startingRating('cat_1')).toBe(1950);
    expect(startingRating(null)).toBe(1500);
    for (const c of [
      'cat_8',
      'cat_7',
      'cat_6',
      'cat_5',
      'cat_4',
      'cat_3',
      'cat_2',
      'cat_1',
    ] as const) {
      expect(categoryForRating(startingRating(c))).toBe(c);
    }
  });
});

describe('teamScore', () => {
  it('weights wins by the game difference', () => {
    const narrow = teamScore(
      [
        { team_1: 7, team_2: 6 },
        { team_1: 6, team_2: 7 },
        { team_1: 7, team_2: 6 },
      ],
      1,
    );
    const lopsided = teamScore(
      [
        { team_1: 6, team_2: 0 },
        { team_1: 6, team_2: 0 },
      ],
      1,
    );
    expect(lopsided).toBe(1);
    expect(narrow).toBeGreaterThan(0.6);
    expect(narrow).toBeLessThan(0.7);
    expect(teamScore([{ team_1: 0, team_2: 6 }], 2)).toBe(0);
  });
});

const U = (n: number): string => `0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e0${n}`;
const fresh = (rating: number, matchesRated = 0): PlayerRating => ({
  rating,
  deviation: 350,
  volatility: 0.06,
  matchesRated,
  category: null,
});

describe('rateMatch', () => {
  it('moves winners up and losers down, counting each pair as its average', () => {
    const current = new Map([
      [U(1), fresh(1500)],
      [U(2), fresh(1500)],
      [U(3), fresh(1500)],
      [U(4), fresh(1500)],
    ]);
    const out = rateMatch(
      [
        { userId: U(1), team: 1 },
        { userId: U(2), team: 1 },
        { userId: U(3), team: 2 },
        { userId: U(4), team: 2 },
      ],
      current,
      0.8,
    );
    const by = new Map(out.map((u) => [u.userId, u]));
    const at = (id: string): RatingUpdate => by.get(id) as RatingUpdate;
    expect(at(U(1)).rating).toBeGreaterThan(1500);
    expect(at(U(1)).rating).toBeCloseTo(at(U(2)).rating, 6);
    expect(at(U(3)).rating).toBeLessThan(1500);
    expect(at(U(1)).matchesRated).toBe(1);
    expect(at(U(1)).deviation).toBeLessThan(350);
  });
});

class FakeRepo extends RatingsRepository {
  rows = new Map<string, PlayerRating>();
  constructor(private readonly match: RatedMatch | null) {
    super();
  }
  findMatch(): Promise<RatedMatch | null> {
    return Promise.resolve(this.match);
  }
  withRatings(
    ids: readonly string[],
    startingFor: Parameters<RatingsRepository['withRatings']>[1],
    compute: (c: Map<string, PlayerRating>) => RatingUpdate[],
  ): Promise<void> {
    const cur = new Map<string, PlayerRating>();
    for (const id of ids) {
      cur.set(id, this.rows.get(id) ?? { ...startingFor(null), matchesRated: 0, category: null });
    }
    for (const u of compute(cur)) this.rows.set(u.userId, u);
    return Promise.resolve();
  }
  find(userId: string): Promise<PlayerRating | null> {
    return Promise.resolve(this.rows.get(userId) ?? null);
  }
}

const SETS = [
  { team_1: 6, team_2: 2 },
  { team_1: 6, team_2: 3 },
];
const FOUR = [1, 2, 3, 4].map((n) => ({
  userId: U(n),
  team: n <= 2 ? (1 as const) : (2 as const),
}));

describe('RatingsService', () => {
  it('skips lessons, matches without winner and without both teams', async () => {
    for (const m of [
      { type: 'lesson' as const, winnerTeam: 1 as const, sets: SETS, players: FOUR },
      { type: 'match' as const, winnerTeam: null, sets: SETS, players: FOUR },
      { type: 'match' as const, winnerTeam: 1 as const, sets: SETS, players: FOUR.slice(0, 2) },
      {
        type: 'match' as const,
        winnerTeam: 1 as const,
        sets: SETS,
        players: [{ userId: null, team: 2 as const }, ...FOUR.slice(0, 2)],
      },
    ]) {
      const repo = new FakeRepo(m);
      expect(await new RatingsService(repo).applyMatch('m')).toBe(false);
      expect(repo.rows.size).toBe(0);
    }
    expect(await new RatingsService(new FakeRepo(null)).applyMatch('m')).toBe(false);
  });

  it('hides rating and category until 5 matches, then shows them', async () => {
    const repo = new FakeRepo({ type: 'match', winnerTeam: 1, sets: SETS, players: FOUR });
    const svc = new RatingsService(repo);
    expect(await svc.visibleFor(U(1))).toEqual({
      rating: null,
      category: null,
      matches_rated: 0,
      matches_to_unlock: 5,
    });
    for (let i = 0; i < 4; i++) await svc.applyMatch('m');
    const four = await svc.visibleFor(U(1));
    expect(four.rating).toBeNull();
    expect(four.category).toBeNull();
    expect(four.matches_to_unlock).toBe(1);
    await svc.applyMatch('m');
    const five = await svc.visibleFor(U(1));
    expect(five.matches_rated).toBe(5);
    expect(five.rating).toBeGreaterThan(1500);
    expect(five.category).toBe(categoryForRating(five.rating as number));
    expect(five.matches_to_unlock).toBe(0);
  });
});
