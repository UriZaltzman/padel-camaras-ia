import type { DbContext } from '../db/db-context';
import type { ClubRecord, ClubSettingsUpdate, ClubSummaryDto } from './club-model';

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
  abstract findById(id: string): Promise<ClubRecord | null>;
  /**
   * Applies the update and writes the audit entry in one transaction; returns the club as it
   * is afterwards. `NOT_FOUND` when the club or a court of the update is not in `ctx`'s club.
   */
  abstract updateSettings(
    ctx: DbContext,
    clubId: string,
    update: ClubSettingsUpdate,
    audit: SettingsAudit,
  ): Promise<ClubRecord>;
}

export class InMemoryClubsRepository extends ClubsRepository {
  listSummaries(): Promise<ClubSummaryDto[]> {
    return Promise.resolve([]);
  }
  /** Clubs a test registers; the directory is empty by default. */
  readonly clubs = new Map<string, ClubRecord>();
  findById(id?: string): Promise<ClubRecord | null> {
    return Promise.resolve((id && this.clubs.get(id)) || null);
  }
  updateSettings(): Promise<ClubRecord> {
    return Promise.reject(new Error('not available in memory'));
  }
}
