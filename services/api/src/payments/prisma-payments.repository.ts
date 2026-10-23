import { Injectable } from '@nestjs/common';
import type { DbContext } from '../db/db-context';
import { PrismaService } from '../db/prisma.service';
import { AppError } from '../errors/app-error';
import type {
  CheckoutRequest,
  CheckoutTarget,
  ConfirmDepositResult,
  NewPayment,
  PaymentRecord,
  PaymentStatus,
} from './payments.model';
import { PaymentsRepository } from './payments.repository';

const system = (clubId: string): DbContext => ({ role: 'system', clubId });

@Injectable()
export class PrismaPaymentsRepository extends PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  resolveTarget(userId: string, request: CheckoutRequest, now: Date): Promise<CheckoutTarget> {
    // Reads act as the paying user, so row level security hides what they cannot see.
    return this.prisma.run({ role: 'player', userId }, async (tx) => {
      if (request.concept === 'deposit') {
        const booking = await tx.booking.findUnique({
          where: { id: request.booking_id },
          include: { club: true },
        });
        if (!booking) throw new AppError('NOT_FOUND');
        if (booking.status !== 'held') {
          throw new AppError(
            booking.status === 'expired' ? 'BOOKING_HOLD_EXPIRED' : 'INVALID_STATE_TRANSITION',
          );
        }
        if (!booking.holdExpiresAt || booking.holdExpiresAt <= now) {
          throw new AppError('BOOKING_HOLD_EXPIRED');
        }
        const amount = booking.club.depositCents;
        if (amount === null || amount <= 0) throw new AppError('CLUB_FEATURE_DISABLED');
        return {
          concept: 'deposit',
          clubId: booking.clubId,
          amountCents: amount,
          collectorId: booking.club.mercadopagoCollectorId,
          payee: booking.club.mercadopagoCollectorId ? 'club' : 'platform',
          title: 'Seña de reserva',
          bookingId: booking.id,
          matchId: null,
          lessonId: null,
          expiresAt: booking.holdExpiresAt,
        };
      }
      if (request.concept === 'player_extra') {
        const match = await tx.match.findUnique({
          where: { id: request.match_id },
          include: { club: true },
        });
        if (!match) throw new AppError('NOT_FOUND');
        const amount = match.club.playerExtraPriceCents;
        if (amount === null || amount <= 0) throw new AppError('CLUB_FEATURE_DISABLED');
        const paid = await tx.payment.findFirst({
          where: { matchId: match.id, userId, concept: 'player_extra', status: 'approved' },
          select: { id: true },
        });
        if (paid) throw new AppError('INVALID_STATE_TRANSITION');
        return {
          concept: 'player_extra',
          clubId: match.clubId,
          amountCents: amount,
          collectorId: match.club.mercadopagoCollectorId,
          payee: match.club.mercadopagoCollectorId ? 'club' : 'platform',
          title: 'Extras del partido',
          bookingId: null,
          matchId: match.id,
          lessonId: null,
          expiresAt: null,
        };
      }
      const lesson = await tx.lesson.findUnique({
        where: { id: request.lesson_id },
        include: { club: true },
      });
      if (!lesson) throw new AppError('NOT_FOUND');
      const amount = lesson.priceCents;
      if (amount === null || amount <= 0) throw new AppError('CLUB_FEATURE_DISABLED');
      const paid = await tx.payment.findFirst({
        where: { lessonId: lesson.id, userId, concept: 'lesson', status: 'approved' },
        select: { id: true },
      });
      if (paid) throw new AppError('INVALID_STATE_TRANSITION');
      // Coaches have no Mercado Pago account in the data model yet: we collect and settle.
      return {
        concept: 'lesson',
        clubId: lesson.clubId,
        amountCents: amount,
        collectorId: null,
        payee: 'platform',
        title: 'Clase',
        bookingId: null,
        matchId: null,
        lessonId: lesson.id,
        expiresAt: null,
      };
    });
  }

  async create(payment: NewPayment): Promise<void> {
    await this.prisma.run(system(payment.clubId), async (tx) => {
      await tx.payment.create({
        data: {
          id: payment.id,
          clubId: payment.clubId,
          userId: payment.userId,
          concept: payment.concept,
          bookingId: payment.bookingId,
          matchId: payment.matchId,
          lessonId: payment.lessonId,
          amountCents: payment.amountCents,
          feeCents: payment.feeCents,
        },
      });
    });
  }

  find(clubId: string, paymentId: string): Promise<PaymentRecord | null> {
    return this.prisma.run(system(clubId), async (tx) => {
      const row = await tx.payment.findFirst({ where: { id: paymentId, clubId } });
      return row
        ? {
            id: row.id,
            clubId: row.clubId,
            userId: row.userId,
            concept: row.concept,
            bookingId: row.bookingId,
            amountCents: row.amountCents,
            feeCents: row.feeCents,
            status: row.status,
            providerPaymentId: row.mercadopagoPaymentId,
          }
        : null;
    });
  }

  transition(
    clubId: string,
    paymentId: string,
    from: PaymentStatus,
    to: PaymentStatus,
    providerPaymentId: string,
  ): Promise<boolean> {
    return this.prisma.run(system(clubId), async (tx) => {
      const result = await tx.payment.updateMany({
        where: { id: paymentId, clubId, status: from },
        data: { status: to, mercadopagoPaymentId: providerPaymentId },
      });
      return result.count === 1;
    });
  }

  confirmDeposit(
    clubId: string,
    bookingId: string,
    amountCents: number,
    now: Date,
  ): Promise<ConfirmDepositResult> {
    return this.prisma.run(system(clubId), async (tx) => {
      const result = await tx.booking.updateMany({
        where: { id: bookingId, clubId, status: 'held', holdExpiresAt: { gt: now } },
        data: { status: 'confirmed', depositPaidCents: { increment: amountCents } },
      });
      if (result.count === 1) return 'confirmed';
      const booking = await tx.booking.findFirst({ where: { id: bookingId, clubId } });
      return booking && booking.status === 'held' ? 'hold_expired' : 'not_held';
    });
  }
}
