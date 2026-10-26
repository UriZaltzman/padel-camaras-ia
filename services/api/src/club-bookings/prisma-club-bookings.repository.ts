import { Injectable } from '@nestjs/common';
import type { DbContext } from '../db/db-context';
import { PrismaService } from '../db/prisma.service';
import {
  ClubBookingsRepository,
  type ClubBookingFilter,
  type ClubBookingRow,
} from './club-bookings.repository';

@Injectable()
export class PrismaClubBookingsRepository extends ClubBookingsRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  list(ctx: DbContext & { clubId: string }, filter: ClubBookingFilter): Promise<ClubBookingRow[]> {
    return this.db.run(ctx, async (tx) => {
      const rows = await tx.booking.findMany({
        where: {
          clubId: ctx.clubId,
          origin: { in: ['app', 'panel'] },
          startsAt: { gte: filter.from, lt: filter.to },
          ...(filter.courtId ? { courtId: filter.courtId } : {}),
          ...(filter.status ? { status: filter.status as never } : {}),
        },
        include: { court: { select: { name: true } } },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        skip: filter.skip,
        take: filter.take,
      });
      const userIds = [
        ...new Set(rows.flatMap((r) => (r.createdByUserId ? [r.createdByUserId] : []))),
      ];
      const users = await tx.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, phone: true },
      });
      const byId = new Map(users.map((u) => [u.id, u]));
      return rows.map((r) => {
        const booker = r.createdByUserId ? byId.get(r.createdByUserId) : undefined;
        return {
          id: r.id,
          clubId: r.clubId,
          courtId: r.courtId,
          courtName: r.court.name,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          status: r.status,
          holdExpiresAt: r.holdExpiresAt,
          priceCents: r.priceCents,
          depositPaidCents: r.depositPaidCents,
          origin: r.origin,
          noRecord: r.noRecord,
          createdAt: r.createdAt,
          bookerId: r.createdByUserId,
          bookerName: booker?.name ?? null,
          bookerPhone: booker?.phone ?? null,
        };
      });
    });
  }
}
