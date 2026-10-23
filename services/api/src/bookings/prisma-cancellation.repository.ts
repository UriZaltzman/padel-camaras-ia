import { Injectable } from '@nestjs/common';
import type { Booking, BookingPlayer, Club, Court, Payment } from '@prisma/client';
import type { DbRole } from '../db/db-context';
import { PrismaService } from '../db/prisma.service';
import {
  CancellationRepository,
  type CancelTarget,
  type StaffClub,
} from './cancellation.repository';

type Row = Booking & { court: Court; club: Club; players: BookingPlayer[]; payments: Payment[] };

function toTarget(row: Row): CancelTarget {
  const deposit = row.payments.find(
    (p) => p.concept === 'deposit' && (p.status === 'approved' || p.status === 'refunded'),
  );
  return {
    id: row.id,
    clubId: row.clubId,
    startsAt: row.startsAt,
    status: row.status,
    cancelledAt: row.cancelledAt,
    depositPaidCents: row.depositPaidCents,
    createdByUserId: row.createdByUserId,
    firstPlayerId: row.players.find((p) => p.position === 1)?.userId ?? null,
    courtRefundHours: null,
    // No club-level column exists yet (decision #242); the court's rule is read below.
    clubRefundHours: null,
    deposit:
      deposit && deposit.mercadopagoPaymentId
        ? {
            paymentId: deposit.id,
            providerPaymentId: deposit.mercadopagoPaymentId,
            status: deposit.status as 'approved' | 'refunded',
          }
        : null,
  };
}

const include = {
  court: true,
  club: true,
  players: true,
  payments: true,
} as const;

@Injectable()
export class PrismaCancellationRepository extends CancellationRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  async staffClubs(userId: string): Promise<StaffClub[]> {
    const rows = await this.db.run({ role: 'player', userId }, (tx) =>
      tx.membership.findMany({
        where: { userId, status: 'active', role: { in: ['staff', 'owner'] } },
        select: { clubId: true, role: true },
      }),
    );
    return rows.map((r) => ({ clubId: r.clubId, role: r.role as 'staff' | 'owner' }));
  }

  async find(
    actor: { role: DbRole; userId: string; clubId?: string },
    bookingId: string,
  ): Promise<CancelTarget | null> {
    return this.db.run(actor, async (tx) => {
      const row = await tx.booking.findUnique({ where: { id: bookingId }, include });
      if (!row) return null;
      const rule = await tx.bookingSlotsRule.findFirst({
        where: { courtId: row.courtId, active: true },
        orderBy: { opensAt: 'asc' },
        select: { cancellationHours: true },
      });
      return { ...toTarget(row), courtRefundHours: rule?.cancellationHours ?? null };
    });
  }

  markCancelled(clubId: string, bookingId: string, now: Date): Promise<boolean> {
    return this.db.run({ role: 'system', clubId }, async (tx) => {
      const r = await tx.booking.updateMany({
        where: { id: bookingId, clubId, status: 'confirmed' },
        data: { status: 'cancelled', cancelledAt: now },
      });
      return r.count === 1;
    });
  }

  markNoShow(clubId: string, bookingId: string): Promise<boolean> {
    return this.db.run({ role: 'system', clubId }, async (tx) => {
      const r = await tx.booking.updateMany({
        where: { id: bookingId, clubId, status: 'confirmed' },
        data: { status: 'no_show' },
      });
      return r.count === 1;
    });
  }

  cancelledWithOpenDeposit(clubId: string): Promise<CancelTarget[]> {
    return this.db.run({ role: 'system', clubId }, async (tx) => {
      const rows = await tx.booking.findMany({
        where: {
          clubId,
          status: 'cancelled',
          payments: { some: { concept: 'deposit', status: 'approved' } },
        },
        include,
      });
      const out: CancelTarget[] = [];
      for (const row of rows) {
        const rule = await tx.bookingSlotsRule.findFirst({
          where: { courtId: row.courtId, active: true },
          orderBy: { opensAt: 'asc' },
          select: { cancellationHours: true },
        });
        out.push({ ...toTarget(row), courtRefundHours: rule?.cancellationHours ?? null });
      }
      return out;
    });
  }
}
