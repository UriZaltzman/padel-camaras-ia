import { Injectable } from '@nestjs/common';
import type { AccessIdentity } from '../auth/session/session.service';
import { AppError } from '../errors/app-error';
import { ClubAccessService } from './club-access.service';
import { MembershipsRepository } from './memberships.repository';
import type { ClubRole } from './permissions';

/** Roles of a club's people. Only the owner changes them (no HTTP endpoint in the contract yet). */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly access: ClubAccessService,
    private readonly memberships: MembershipsRepository,
  ) {}

  async grant(auth: AccessIdentity, clubId: string, userId: string, role: ClubRole): Promise<void> {
    const { db } = await this.access.authorize(auth, clubId, 'club.manage_members');
    await this.memberships.grant(db, clubId, userId, role);
  }

  async revoke(
    auth: AccessIdentity,
    clubId: string,
    userId: string,
    role: ClubRole,
  ): Promise<void> {
    const { db } = await this.access.authorize(auth, clubId, 'club.manage_members');
    if (!(await this.memberships.revoke(db, clubId, userId, role))) throw new AppError('NOT_FOUND');
  }
}
