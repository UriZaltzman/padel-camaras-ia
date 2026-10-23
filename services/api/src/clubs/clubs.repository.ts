import type { DbContext } from '../db/db-context';
import type { ClubDto, ClubSettingsUpdate, ClubSummaryDto } from './club-model';

/** Who makes a settings change, for `audit_log`. */
export interface SettingsAudit {
  actorUserId: string;
  requestId?: string;
}

/**
 * Clubs and their courts. The service talks to this port; `PrismaClubsRepository` is the real
 * one and `InMemoryClubsRepository` serves the contract tests, which run without a database.
 */
export abstract class ClubsRepository {
  /** Every club, for the public directory. The service filters and pages. */
  abstract listSummaries(): Promise<ClubSummaryDto[]>;
  abstract findById(id: string): Promise<ClubDto | null>;
  /**
   * Applies the update and writes the audit entry in one transaction; returns the club as it
   * is afterwards. `NOT_FOUND` when the club or a court of the update is not in `ctx`'s club.
   */
  abstract updateSettings(
    ctx: DbContext,
    clubId: string,
    update: ClubSettingsUpdate,
    audit: SettingsAudit,
  ): Promise<ClubDto>;
}

export class InMemoryClubsRepository extends ClubsRepository {
  listSummaries(): Promise<ClubSummaryDto[]> {
    return Promise.resolve([]);
  }
  findById(): Promise<ClubDto | null> {
    return Promise.resolve(null);
  }
  updateSettings(): Promise<ClubDto> {
    return Promise.reject(new Error('not available in memory'));
  }
}
