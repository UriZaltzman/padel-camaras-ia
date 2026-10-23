import { Injectable } from '@nestjs/common';
import { updateRating, type Glicko } from './glicko2';
import {
  RATING_CONFIG,
  categoryForRating,
  startingRating,
  teamScore,
  type Category,
} from './rating-config';
import { RatingsRepository, type PlayerRating, type RatingUpdate } from './ratings.repository';

export interface VisibleRating {
  /** Null until the player has `minMatchesToShow` rated matches. */
  rating: number | null;
  category: Category | null;
  matches_rated: number;
  matches_to_unlock: number;
}

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Pure: the new ratings of everyone in a match, the pair counted as the average of its two. */
export function rateMatch(
  players: readonly { userId: string; team: 1 | 2 }[],
  current: ReadonlyMap<string, PlayerRating>,
  score1: number,
): RatingUpdate[] {
  const team = (t: 1 | 2): { rating: number; deviation: number } => {
    const ps = players
      .filter((p) => p.team === t)
      .map((p) => current.get(p.userId) as PlayerRating);
    return { rating: mean(ps.map((p) => p.rating)), deviation: mean(ps.map((p) => p.deviation)) };
  };
  const avg = { 1: team(1), 2: team(2) };
  return players.map((p) => {
    const me = current.get(p.userId) as PlayerRating;
    const opp = avg[p.team === 1 ? 2 : 1];
    const score = p.team === 1 ? score1 : 1 - score1;
    const next = updateRating(me, [{ ...opp, score }], RATING_CONFIG.tau);
    const matchesRated = me.matchesRated + 1;
    return {
      userId: p.userId,
      ...next,
      matchesRated,
      category: categoryForRating(next.rating),
    };
  });
}

@Injectable()
export class RatingsService {
  constructor(private readonly repo: RatingsRepository) {}

  /**
   * Updates the ratings of a published match. Lessons, matches without a winner and matches
   * without at least one identified player per team are skipped. Call once per match.
   */
  async applyMatch(matchId: string): Promise<boolean> {
    const match = await this.repo.findMatch(matchId);
    if (!match || match.type !== 'match' || match.winnerTeam === null) return false;
    const players = match.players.filter(
      (p): p is { userId: string; team: 1 | 2 } => p.userId !== null,
    );
    if (!players.some((p) => p.team === 1) || !players.some((p) => p.team === 2)) return false;
    const score1 = teamScore(match.sets, match.winnerTeam);
    await this.repo.withRatings(
      players.map((p) => p.userId),
      this.starting,
      (current) => rateMatch(players, current, score1),
    );
    return true;
  }

  /** The rating as the player may see it: hidden until enough matches are rated. */
  async visibleFor(userId: string): Promise<VisibleRating> {
    const r = await this.repo.find(userId);
    const rated = r?.matchesRated ?? 0;
    const unlocked = r !== null && rated >= RATING_CONFIG.minMatchesToShow;
    return {
      rating: unlocked ? Math.round(r.rating) : null,
      category: unlocked ? categoryForRating(r.rating) : null,
      matches_rated: rated,
      matches_to_unlock: Math.max(0, RATING_CONFIG.minMatchesToShow - rated),
    };
  }

  private readonly starting = (declared: Category | null): Glicko => ({
    rating: startingRating(declared),
    deviation: RATING_CONFIG.initialDeviation,
    volatility: RATING_CONFIG.initialVolatility,
  });
}
