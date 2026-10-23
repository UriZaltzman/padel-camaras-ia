import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock';
import { AppError } from '../errors/app-error';
import type { AccessIdentity } from '../auth/session/session.service';
import { RATING_CONFIG, categoryForRating, type Category } from '../ratings/rating-config';
import { RankingRepository, type RankingRow } from './ranking.repository';

/** Months of play the ranking looks at. */
export const RANKING_WINDOW_MONTHS = 12;

export interface RankingEntryDto {
  position: number;
  user_id: string;
  name: string;
  photo_url: string | null;
  matches: number;
  wins: number;
  /** True for the caller's own row. */
  is_me: boolean;
}

export interface ClubRankingDto {
  club_id: string;
  category: string;
  window_months: number;
  entries: RankingEntryDto[];
}

/**
 * Pure: players of `category` ordered by rating (ties: more wins, then more matches, then name).
 * Privacy: players with fewer than `minMatchesToShow` rated matches never appear, and no
 * rating number is exposed — only the order and the club's own win/match counts.
 */
export function buildRanking(
  rows: readonly RankingRow[],
  category: Category,
  me: string,
  limit: number,
): RankingEntryDto[] {
  return rows
    .filter(
      (r) =>
        r.matchesRated >= RATING_CONFIG.minMatchesToShow &&
        categoryForRating(r.rating) === category,
    )
    .sort(
      (a, b) =>
        b.rating - a.rating ||
        b.wins - a.wins ||
        b.matches - a.matches ||
        a.name.localeCompare(b.name) ||
        a.userId.localeCompare(b.userId),
    )
    .slice(0, limit)
    .map((r, i) => ({
      position: i + 1,
      user_id: r.userId,
      name: r.name,
      photo_url: r.photoUrl,
      matches: r.matches,
      wins: r.wins,
      is_me: r.userId === me,
    }));
}

@Injectable()
export class RankingService {
  constructor(
    private readonly repo: RankingRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(
    auth: AccessIdentity,
    clubId: string,
    category: Category,
    limit: number,
  ): Promise<ClubRankingDto> {
    // Not a participant: same answer as a club that does not exist.
    if (!(await this.repo.isParticipant(auth.userId, clubId))) throw new AppError('NOT_FOUND');
    const since = this.clock.now();
    since.setUTCMonth(since.getUTCMonth() - RANKING_WINDOW_MONTHS);
    const rows = await this.repo.rows(clubId, since);
    return {
      club_id: clubId,
      category: category.slice('cat_'.length),
      window_months: RANKING_WINDOW_MONTHS,
      entries: buildRanking(rows, category, auth.userId, limit),
    };
  }
}
