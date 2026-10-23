import type { SetScore } from '../matches/score';

export type Category =
  'cat_8' | 'cat_7' | 'cat_6' | 'cat_5' | 'cat_4' | 'cat_3' | 'cat_2' | 'cat_1';

/** Lowest to highest. 8va is the beginner category, 1ra the top one. */
export const CATEGORIES_ASC: readonly Category[] = [
  'cat_8',
  'cat_7',
  'cat_6',
  'cat_5',
  'cat_4',
  'cat_3',
  'cat_2',
  'cat_1',
];

/** Tunable values of the rating system (spec §7); change them here only. */
export const RATING_CONFIG = {
  /** Rated matches before the number and category are shown. */
  minMatchesToShow: 5,
  /** Glicko-2 system constant: how fast volatility may change. */
  tau: 0.5,
  initialDeviation: 350,
  initialVolatility: 0.06,
  /** Starting rating when the player declared no category. */
  defaultRating: 1500,
  /** Lower bound of each category on the Glicko scale; 8va has none. */
  lowerBounds: {
    cat_7: 1300,
    cat_6: 1400,
    cat_5: 1500,
    cat_4: 1600,
    cat_3: 1700,
    cat_2: 1800,
    cat_1: 1900,
  } as Record<Exclude<Category, 'cat_8'>, number>,
  /** Width of the top and bottom categories, to place their starting midpoint. */
  edgeWidth: 100,
  /** Score of a win by the narrowest margin; a shutout win scores 1. */
  minWinScore: 0.6,
} as const;

/** Category for a rating, from the configured lower bounds. */
export function categoryForRating(rating: number): Category {
  let result: Category = 'cat_8';
  for (const c of CATEGORIES_ASC) {
    if (c === 'cat_8') continue;
    if (rating >= RATING_CONFIG.lowerBounds[c]) result = c;
  }
  return result;
}

/** Middle of a declared category: where a new player starts. */
export function startingRating(declared: Category | null): number {
  if (!declared) return RATING_CONFIG.defaultRating;
  const lb = RATING_CONFIG.lowerBounds;
  if (declared === 'cat_8') return lb.cat_7 - RATING_CONFIG.edgeWidth / 2;
  if (declared === 'cat_1') return lb.cat_1 + RATING_CONFIG.edgeWidth / 2;
  const i = CATEGORIES_ASC.indexOf(declared);
  const next = CATEGORIES_ASC[i + 1] as Exclude<Category, 'cat_8'>;
  return (lb[declared] + lb[next]) / 2;
}

/**
 * Score of team 1 in [0, 1] from the games: the winner gets `minWinScore` for a narrow win up
 * to 1 for a shutout, so a lopsided result moves ratings more.
 */
export function teamScore(sets: readonly SetScore[], winnerTeam: 1 | 2): number {
  let w = 0;
  let l = 0;
  for (const s of sets) {
    w += winnerTeam === 1 ? s.team_1 : s.team_2;
    l += winnerTeam === 1 ? s.team_2 : s.team_1;
  }
  const margin = w + l === 0 ? 0 : Math.max(0, (w - l) / (w + l));
  const winScore = RATING_CONFIG.minWinScore + (1 - RATING_CONFIG.minWinScore) * margin;
  return winnerTeam === 1 ? winScore : 1 - winScore;
}
