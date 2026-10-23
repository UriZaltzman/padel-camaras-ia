import { Injectable } from '@nestjs/common';
import type { AccessIdentity } from '../auth/session/session.service';
import type { DbContext } from '../db/db-context';
import { AppError } from '../errors/app-error';
import { setLogContext } from '../logging/request-context';
import { MembershipsRepository } from './memberships.repository';
import { can, strongestRole, type ClubPermission, type ClubRole } from './permissions';

export interface ClubAccess {
  role: ClubRole;
  /** The database context to run the request with: the user's strongest role in this club. */
  db: DbContext;
}

/** Decides what a signed-in user may do in a club, from their memberships. */
@Injectable()
export class ClubAccessService {
  constructor(private readonly memberships: MembershipsRepository) {}

  /**
   * A user with no role in the club gets `NOT_FOUND`, so the endpoint does not reveal which
   * clubs exist; a member without the permission gets `FORBIDDEN`.
   */
  async authorize(
    auth: AccessIdentity,
    clubId: string,
    permission: ClubPermission,
  ): Promise<ClubAccess> {
    const role = strongestRole(await this.memberships.activeRoles(auth.userId, clubId));
    if (role === null) throw new AppError('NOT_FOUND');
    if (!can(role, permission)) throw new AppError('FORBIDDEN');
    setLogContext({ club_id: clubId });
    return { role, db: { role, userId: auth.userId, clubId } };
  }
}
