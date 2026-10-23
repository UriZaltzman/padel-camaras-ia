import type { DbContext } from '../db/db-context';
import type { ClubModules } from './club-modules';

export interface ModulesAudit {
  actorUserId: string;
  requestId?: string;
}

/** Reads and writes the flags of a club. `PrismaClubModulesRepository` is the real one. */
export abstract class ClubModulesRepository {
  /** `null` when the club has no row yet (defaults apply). */
  abstract find(ctx: DbContext, clubId: string): Promise<ClubModules | null>;
  /** Replaces the flags and writes the audit entry in one transaction. `NOT_FOUND` for an unknown club. */
  abstract replace(
    ctx: DbContext,
    clubId: string,
    modules: ClubModules,
    audit: ModulesAudit,
  ): Promise<void>;
}

export class InMemoryClubModulesRepository extends ClubModulesRepository {
  readonly rows = new Map<string, ClubModules>();
  find(_ctx: DbContext, clubId: string): Promise<ClubModules | null> {
    return Promise.resolve(this.rows.get(clubId) ?? null);
  }
  replace(_ctx: DbContext, clubId: string, modules: ClubModules): Promise<void> {
    this.rows.set(clubId, modules);
    return Promise.resolve();
  }
}
