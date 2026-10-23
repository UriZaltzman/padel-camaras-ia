import { Inject, Injectable } from '@nestjs/common';
import type { AccessIdentity } from '../auth/session/session.service';
import { CLOCK, type Clock } from '../common/clock';
import { AppError } from '../errors/app-error';
import { setLogContext } from '../logging/request-context';
import { assertMatchTransition, type MatchStatus } from './match-transitions';
import { MatchesRepository, type Actor, type MatchRecord } from './matches.repository';
import { winnerOf, type SetScore } from './score';

export type ScoreCorrectionInput =
  | { type: 'final_score'; sets: SetScore[] }
  | { type: 'point_winner'; point_id: string; winner_team: 1 | 2 };

export interface MatchDetailDto {
  id: string;
  type: 'match' | 'lesson';
  status: MatchStatus;
  starts_at: string;
  ends_at: string;
  club: { id: string; name: string };
  court: { id: string; name: string };
  booking_id: string | null;
  golden_point: boolean;
  sets: SetScore[];
  winner_team: 1 | 2 | null;
  players: {
    position: number;
    team: 1 | 2;
    user: { id: string; display_name: string; photo_url: string | null } | null;
    confirmed: boolean;
    thumbnail_media_id: string | null;
    stats: null;
  }[];
  points_to_review: {
    id: string;
    number: number;
    set: number;
    game: number;
    winner_team: 1 | 2;
    end_reason: string;
    confidence: number;
    clip_media_id: string | null;
  }[];
  insights: { id: string; kind: string; text: string; tip: null; order: number }[] | null;
  full_video: null;
  reel: null;
  published_at: null;
}

export interface ScoreCorrectionDto {
  id: string;
  match_id: string;
  type: 'final_score' | 'point_winner';
  match_status: 'needs_review';
  created_at: string;
}

/** Statuses from which positions exist (section 5): the analysis has finished. */
const HAS_POSITIONS: readonly MatchStatus[] = ['published', 'needs_review', 'archived'];

@Injectable()
export class MatchesService {
  constructor(
    private readonly repo: MatchesRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(auth: AccessIdentity, matchId: string): Promise<MatchDetailDto> {
    const { match, staff } = await this.load(auth, matchId);
    return this.toDto(match, auth.userId, staff);
  }

  async claimPlayer(
    auth: AccessIdentity,
    matchId: string,
    position: number,
  ): Promise<MatchDetailDto> {
    const located = await this.repo.locate(matchId);
    if (!located) throw new AppError('NOT_FOUND');
    setLogContext({ club_id: located.clubId, match_id: matchId });
    if (!(await this.repo.mayClaim(matchId, auth.userId))) throw new AppError('NOT_FOUND');
    if (!HAS_POSITIONS.includes(located.status)) throw new AppError('MATCH_NOT_PUBLISHED');
    const result = await this.repo.claim(
      located.clubId,
      matchId,
      position,
      auth.userId,
      this.clock.now(),
    );
    if (result === 'slot_taken') throw new AppError('MATCH_PLAYER_SLOT_TAKEN', { position });
    if (result === 'already_joined') throw new AppError('MATCH_ALREADY_JOINED');
    return this.get(auth, matchId);
  }

  async correctScore(
    auth: AccessIdentity,
    matchId: string,
    input: ScoreCorrectionInput,
  ): Promise<ScoreCorrectionDto> {
    const { match } = await this.load(auth, matchId);
    if (!(await this.repo.isConfirmedPlayer(matchId, auth.userId))) {
      throw new AppError('FORBIDDEN');
    }
    // Before publishing there is nothing to correct; from `needs_review` or `archived` the
    // contract's table forbids the move.
    if (!HAS_POSITIONS.includes(match.status)) throw new AppError('MATCH_NOT_PUBLISHED');
    assertMatchTransition(match.status, 'needs_review');

    const now = this.clock.now();
    let correction;
    if (input.type === 'final_score') {
      const winner = winnerOf(input.sets, match);
      if (!winner) throw new AppError('VALIDATION_FAILED', { field: 'sets' });
      correction = { type: 'final_score' as const, sets: input.sets, winnerTeam: winner };
    } else {
      correction = {
        type: 'point_winner' as const,
        pointId: input.point_id,
        winnerTeam: input.winner_team,
      };
    }
    const result = await this.repo.applyCorrection(match.clubId, matchId, correction, now);
    if (result === 'no_point') throw new AppError('VALIDATION_FAILED', { field: 'point_id' });
    if (result === 'moved') throw new AppError('INVALID_STATE_TRANSITION');
    return {
      id: result.id,
      match_id: matchId,
      type: input.type,
      match_status: 'needs_review',
      created_at: now.toISOString(),
    };
  }

  /** Visible match plus whether the caller is club staff there (they get no personal data). */
  private async load(
    auth: AccessIdentity,
    matchId: string,
  ): Promise<{ match: MatchRecord; staff: boolean }> {
    const asPlayer: Actor = { role: 'player', userId: auth.userId };
    const own = await this.repo.find(asPlayer, matchId);
    if (own) {
      setLogContext({ club_id: own.clubId, match_id: matchId });
      return { match: own, staff: false };
    }
    for (const c of await this.repo.staffClubs(auth.userId)) {
      const found = await this.repo.find(
        { role: c.role, userId: auth.userId, clubId: c.clubId },
        matchId,
      );
      if (found) {
        setLogContext({ club_id: found.clubId, match_id: matchId });
        return { match: found, staff: true };
      }
    }
    throw new AppError('NOT_FOUND');
  }

  private toDto(m: MatchRecord, userId: string, staff: boolean): MatchDetailDto {
    const isPlayer = !staff && m.players.some((p) => p.userId === userId);
    return {
      id: m.id,
      type: m.type,
      status: m.status,
      starts_at: m.startsAt.toISOString(),
      ends_at: m.endsAt.toISOString(),
      club: { id: m.clubId, name: m.clubName },
      court: { id: m.courtId, name: m.courtName },
      booking_id: m.bookingId,
      golden_point: m.goldenPoint,
      sets: m.sets,
      winner_team: m.winnerTeam,
      players: m.players.map((p) => ({
        position: p.position,
        team: p.team,
        user:
          p.userId && p.displayName
            ? { id: p.userId, display_name: p.displayName, photo_url: p.photoUrl }
            : null,
        confirmed: p.confirmed,
        // Stats and thumbnails arrive with the stats pipeline and the media wiring.
        thumbnail_media_id: null,
        stats: null,
      })),
      points_to_review: staff
        ? []
        : m.pointsToReview.map((p) => ({
            id: p.id,
            number: p.number,
            set: p.set,
            game: p.game,
            winner_team: p.winnerTeam,
            end_reason: p.endReason,
            confidence: p.confidence,
            clip_media_id: null,
          })),
      insights: isPlayer ? m.insights.map((i) => ({ ...i, tip: null })) : null,
      full_video: null,
      reel: null,
      published_at: null,
    };
  }
}
