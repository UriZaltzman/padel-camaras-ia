import { Injectable } from '@nestjs/common';
import { newId } from '../db/ids';
import { PrismaService } from '../db/prisma.service';
import type { DbContext } from '../db/db-context';
import type { ClubRole } from './permissions';

@Injectable()
export class MembershipsRepository {
  constructor(private readonly db: PrismaService) {}

  /** Active roles of a user in a club. A user sees their own memberships whatever the club. */
  async activeRoles(userId: string, clubId: string): Promise<ClubRole[]> {
    const rows = await this.db.run({ role: 'player', userId }, (tx) =>
      tx.membership.findMany({
        where: { userId, clubId, status: 'active' },
        select: { role: true },
      }),
    );
    return rows.map((row) => row.role);
  }

  /** Gives a user a role in the club, or re-activates it. Runs as the club owner. */
  async grant(ctx: DbContext, clubId: string, userId: string, role: ClubRole): Promise<void> {
    await this.db.run(ctx, (tx) =>
      tx.membership.upsert({
        where: { clubId_userId_role: { clubId, userId, role } },
        create: { id: newId(), clubId, userId, role, status: 'active' },
        update: { status: 'active' },
      }),
    );
  }

  /** Revokes a role (the row stays, as history). Returns false if there was nothing to revoke. */
  async revoke(ctx: DbContext, clubId: string, userId: string, role: ClubRole): Promise<boolean> {
    const result = await this.db.run(ctx, (tx) =>
      tx.membership.updateMany({
        where: { clubId, userId, role, status: { not: 'revoked' } },
        data: { status: 'revoked' },
      }),
    );
    return result.count > 0;
  }
}
