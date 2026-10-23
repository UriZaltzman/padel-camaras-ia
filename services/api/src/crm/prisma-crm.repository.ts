import { Injectable } from '@nestjs/common';
import type { DbContext } from '../db/db-context';
import { newId } from '../db/ids';
import { PrismaService } from '../db/prisma.service';
import { CrmRepository, type CrmPerson } from './crm.repository';

type Ctx = DbContext & { clubId: string };

@Injectable()
export class PrismaCrmRepository extends CrmRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  people(ctx: Ctx, userId?: string): Promise<CrmPerson[]> {
    return this.db.run(ctx, async (tx) => {
      const rows = await tx.bookingPlayer.findMany({
        where: {
          clubId: ctx.clubId,
          userId: userId ?? { not: null },
          OR: [{ position: 1 }, { accepted: true }],
        },
        include: { user: true, booking: { include: { court: true } } },
      });
      const ids = [...new Set(rows.flatMap((r) => (r.userId ? [r.userId] : [])))];
      const notes = await tx.clubPlayerNote.findMany({
        where: { clubId: ctx.clubId, userId: { in: ids } },
      });
      // Payments are the owner's (RLS); staff never gets the figure.
      const spend =
        ctx.role === 'owner'
          ? await tx.payment.groupBy({
              by: ['userId'],
              where: { clubId: ctx.clubId, userId: { in: ids }, status: 'approved' },
              _sum: { amountCents: true },
            })
          : null;

      const byUser = new Map<string, CrmPerson>();
      for (const r of rows) {
        if (!r.userId || !r.user) continue;
        let person = byUser.get(r.userId);
        if (!person) {
          const note = notes.find((n) => n.userId === r.userId);
          person = {
            userId: r.userId,
            name: r.user.name,
            phone: r.user.phone,
            email: r.user.email,
            tags: note?.tags ?? [],
            notes: note?.notes ?? null,
            spendCents: spend
              ? (spend.find((s) => s.userId === r.userId)?._sum.amountCents ?? 0)
              : null,
            bookings: [],
          };
          byUser.set(r.userId, person);
        }
        person.bookings.push({
          id: r.booking.id,
          startsAt: r.booking.startsAt,
          endsAt: r.booking.endsAt,
          status: r.booking.status,
          position: r.position,
          courtName: r.booking.court.name,
          priceCents: r.booking.priceCents,
        });
      }
      return [...byUser.values()];
    });
  }

  saveNotes(ctx: Ctx, userId: string, tags: string[], notes: string | null): Promise<boolean> {
    return this.db.run(ctx, async (tx) => {
      const known = await tx.bookingPlayer.findFirst({
        where: { clubId: ctx.clubId, userId },
        select: { id: true },
      });
      if (!known) return false;
      await tx.clubPlayerNote.upsert({
        where: { clubId_userId: { clubId: ctx.clubId, userId } },
        create: { id: newId(), clubId: ctx.clubId, userId, tags, notes },
        update: { tags, notes },
      });
      return true;
    });
  }
}
