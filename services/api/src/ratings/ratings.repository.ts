import type { SetScore } from '../matches/score';
import type { Glicko } from './glicko2';
import type { Category } from './rating-config';

export interface RatedMatch {
  type: 'match' | 'lesson';
  winnerTeam: 1 | 2 | null;
  sets: SetScore[];
  players: { userId: string | null; team: 1 | 2 }[];
}

export interface PlayerRating extends Glicko {
  matchesRated: number;
  category: Category | null;
}

export interface RatingUpdate extends Glicko {
  userId: string;
  matchesRated: number;
  category: Category | null;
}

export abstract class RatingsRepository {
  abstract findMatch(matchId: string): Promise<RatedMatch | null>;
  /**
   * In one transaction: lock the users' rating rows (created at the middle of the declared
   * category when missing), hand them to `compute`, and write what it returns.
   */
  abstract withRatings(
    userIds: readonly string[],
    startingFor: (declared: Category | null) => Glicko,
    compute: (current: Map<string, PlayerRating>) => RatingUpdate[],
  ): Promise<void>;
  abstract find(userId: string): Promise<PlayerRating | null>;
}
