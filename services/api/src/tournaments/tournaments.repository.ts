import type { DbContext } from '../db/db-context';
import type { Interval, KnockoutStage, PointsConfig, SetResult } from './tournament-draw';

export type TournamentStatus = 'registration' | 'in_progress' | 'finished' | 'cancelled';
export type MatchStatus = 'scheduled' | 'awaiting_confirmation' | 'confirmed';
export type Stage = 'group' | KnockoutStage;

export interface TournamentRow {
  id: string;
  clubId: string;
  name: string;
  category: number;
  status: TournamentStatus;
  entryFeeCents: number;
  matchMinutes: number;
  points: PointsConfig;
  pairCount: number;
}

export interface PlayerRef {
  userId: string;
  name: string;
}

export interface PairRow {
  id: string;
  players: [PlayerRef, PlayerRef];
  strength: number | null;
  seed: number | null;
  groupId: string | null;
  paid: boolean;
  createdAt: Date;
}

export interface GroupRow {
  id: string;
  position: number;
}

export interface MatchRow {
  id: string;
  stage: Stage;
  groupId: string | null;
  round: number;
  bracketKey: string | null;
  pairAId: string | null;
  pairBId: string | null;
  nextMatchId: string | null;
  nextSide: 'a' | 'b' | null;
  courtId: string;
  startsAt: Date;
  endsAt: Date;
  status: MatchStatus;
  sets: SetResult[] | null;
  winnerPairId: string | null;
  reportedByUserId: string | null;
}

export interface UserInfo {
  userId: string;
  name: string;
  /** Glicko rating; null when the player has none yet. */
  rating: number | null;
}

export interface NewPair {
  id: string;
  tournamentId: string;
  player1UserId: string;
  player2UserId: string;
  createdByUserId: string;
}

export interface DrawPlan {
  tournamentId: string;
  pairs: { id: string; strength: number; seed: number; groupId: string }[];
  groups: { id: string; position: number }[];
  matches: (Omit<MatchRow, 'status' | 'sets' | 'winnerPairId' | 'reportedByUserId'> & {
    createdByUserId: string;
  })[];
}

/** Everything one confirmed result changes, applied in a single transaction. */
export interface Confirmation {
  matchId: string;
  tournamentId: string;
  confirmedByUserId: string;
  sets: SetResult[];
  winnerPairId: string;
  /** Pairs written into later matches: the winner, or the qualified pairs after the groups. */
  slots: { matchId: string; side: 'a' | 'b'; pairId: string }[];
  finish: { points: { userId: string; points: number }[] } | null;
}

export interface Report {
  matchId: string;
  sets: SetResult[];
  winnerPairId: string;
  reportedByUserId: string;
}

export interface RankingRow {
  userId: string;
  name: string;
  points: number;
  tournaments: number;
}

export type DrawOutcome = 'ok' | 'closed' | 'slots';

export abstract class TournamentsRepository {
  /** Whether the user holds an active role in the club or played a confirmed match there. */
  abstract isParticipant(userId: string, clubId: string): Promise<boolean>;
  abstract list(ctx: DbContext, clubId: string): Promise<TournamentRow[]>;
  abstract find(ctx: DbContext, clubId: string, id: string): Promise<TournamentRow | null>;
  abstract create(
    ctx: DbContext,
    row: Omit<TournamentRow, 'status' | 'pairCount'> & { createdByUserId: string },
  ): Promise<void>;
  /** Active (not withdrawn) pairs, in registration order. */
  abstract pairs(ctx: DbContext, tournamentId: string): Promise<PairRow[]>;
  abstract groups(ctx: DbContext, tournamentId: string): Promise<GroupRow[]>;
  abstract matches(ctx: DbContext, tournamentId: string): Promise<MatchRow[]>;
  /** The users the context can see; others are left out. */
  abstract users(ctx: DbContext, userIds: string[]): Promise<UserInfo[]>;
  /** Adds a pair if registration is still open; a player already in a pair gives `taken`. */
  abstract addPair(ctx: DbContext, pair: NewPair): Promise<'ok' | 'closed' | 'taken'>;
  abstract withdraw(
    ctx: DbContext,
    pairId: string,
    now: Date,
  ): Promise<'ok' | 'closed' | 'missing'>;
  abstract markPaid(ctx: DbContext, pairId: string, now: Date): Promise<boolean>;
  /** Ids of the club's courts that are active, among `ids`. */
  abstract activeCourts(ctx: DbContext, clubId: string, ids: string[]): Promise<string[]>;
  /** Intervals already occupying each court inside the window (any booking or block). */
  abstract busy(
    ctx: DbContext,
    courtIds: string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, Interval[]>>;
  /** Stores the draw, books every match and starts the tournament, or stores nothing. */
  abstract applyDraw(ctx: DbContext, plan: DrawPlan, actorUserId: string): Promise<DrawOutcome>;
  /** Stores a result waiting for the rival; false if the match was confirmed meanwhile. */
  abstract report(ctx: DbContext, report: Report): Promise<boolean>;
  /** Confirms; false if the match was not waiting for confirmation any more. */
  abstract confirm(ctx: DbContext, confirmation: Confirmation, now: Date): Promise<boolean>;
  abstract ranking(
    ctx: DbContext,
    clubId: string,
    category: number,
    since: Date,
  ): Promise<RankingRow[]>;
}
