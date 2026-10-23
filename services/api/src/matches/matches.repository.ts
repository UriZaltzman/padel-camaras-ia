import type { DbRole } from '../db/db-context';
import type { MatchStatus } from './match-transitions';
import type { SetScore } from './score';

export interface Actor {
  role: DbRole;
  userId: string;
  clubId?: string;
}

export interface MatchRecord {
  id: string;
  clubId: string;
  clubName: string;
  courtId: string;
  courtName: string;
  bookingId: string | null;
  type: 'match' | 'lesson';
  status: MatchStatus;
  startsAt: Date;
  endsAt: Date;
  goldenPoint: boolean;
  bestOfSets: number;
  superTiebreak: boolean;
  sets: SetScore[];
  winnerTeam: 1 | 2 | null;
  players: {
    position: number;
    team: 1 | 2;
    userId: string | null;
    displayName: string | null;
    photoUrl: string | null;
    confirmed: boolean;
  }[];
  /** Points under the review threshold, only filled for players. */
  pointsToReview: {
    id: string;
    number: number;
    set: number;
    game: number;
    winnerTeam: 1 | 2;
    endReason: string;
    confidence: number;
  }[];
  insights: { id: string; kind: string; text: string; order: number }[];
}

export type ClaimResult = 'claimed' | 'slot_taken' | 'already_joined';

export type Correction =
  | { type: 'final_score'; sets: SetScore[]; winnerTeam: 1 | 2 }
  | { type: 'point_winner'; pointId: string; winnerTeam: 1 | 2 };

export abstract class MatchesRepository {
  /** Clubs where the user is active staff or owner. */
  abstract staffClubs(userId: string): Promise<{ clubId: string; role: 'staff' | 'owner' }[]>;
  /** The match as the actor may see it (row level security decides); null if not visible. */
  abstract find(actor: Actor, matchId: string): Promise<MatchRecord | null>;
  /** The match (club and status) whatever the caller, to decide who may claim; null if absent. */
  abstract locate(matchId: string): Promise<{ clubId: string; status: MatchStatus } | null>;
  /** True if the user was in the match's booking or already holds a position. */
  abstract mayClaim(matchId: string, userId: string): Promise<boolean>;
  abstract claim(
    clubId: string,
    matchId: string,
    position: number,
    userId: string,
    now: Date,
  ): Promise<ClaimResult>;
  /** True if the user holds a confirmed position. */
  abstract isConfirmedPlayer(matchId: string, userId: string): Promise<boolean>;
  /**
   * `published` -> `needs_review` and the correction written, in one transaction. Returns the
   * correction id, `no_point` if the point is not in the match, or `moved` if the status was
   * no longer `published`.
   */
  abstract applyCorrection(
    clubId: string,
    matchId: string,
    correction: Correction,
    now: Date,
  ): Promise<{ id: string } | 'no_point' | 'moved'>;
}
