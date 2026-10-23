import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DbContext } from '../db/db-context';
import { newId } from '../db/ids';
import { PrismaService } from '../db/prisma.service';
import { depositOf, toRule } from '../clubs/prisma-clubs.repository';
import {
  BookingsRepository,
  SlotTakenError,
  type CourtRules,
  type NewHold,
  type StoredBooking,
} from './bookings.repository';
import { OCCUPYING_STATUSES } from './booking-policy';
import type { Interval } from './slots';

// Public data (court rules, club directory) is readable by any player under RLS.
const PUBLIC: DbContext = { role: 'player' };

function isExclusionViolation(error: unknown): boolean {
  const text =
    error instanceof Error
      ? `${error.message} ${JSON.stringify((error as { meta?: unknown }).meta ?? '')}`
      : '';
  return /23P01|bookings_no_overlap_excl|exclusion constraint/i.test(text);
}

@Injectable()
export class PrismaBookingsRepository extends BookingsRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  async findCourt(courtId: string): Promise<CourtRules | null> {
    const court = await this.db.run(PUBLIC, (tx) =>
      tx.court.findUnique({
        where: { id: courtId },
        include: {
          club: { select: { timezone: true } },
          bookingSlotsRules: {
            where: { active: true },
            orderBy: { opensAt: 'asc' },
            include: { priceBands: { orderBy: [{ startsAt: 'asc' }, { durationMinutes: 'asc' }] } },
          },
        },
      }),
    );
    if (!court) return null;
    const first = court.bookingSlotsRules[0];
    return {
      courtId: court.id,
      clubId: court.clubId,
      timezone: court.club.timezone,
      status: court.status,
      rules: court.bookingSlotsRules.map(toRule),
      deposit: depositOf(first),
      cancellationRefundHours: first?.cancellationHours ?? 24,
    };
  }

  async occupied(
    clubId: string,
    courtId: string,
    from: Date,
    to: Date,
    now: Date,
  ): Promise<Interval[]> {
    const rows = await this.db.run({ role: 'system', clubId }, (tx) =>
      tx.booking.findMany({
        where: {
          courtId,
          startsAt: { lt: to },
          endsAt: { gt: from },
          status: { in: [...OCCUPYING_STATUSES] },
          NOT: { status: 'held', holdExpiresAt: { lte: now } },
        },
        select: { startsAt: true, endsAt: true },
      }),
    );
    return rows.map((r) => ({ start: r.startsAt, end: r.endsAt }));
  }

  async expireHolds(clubId: string, now: Date): Promise<string[]> {
    return this.db.run({ role: 'system', clubId }, async (tx) => {
      const rows = await tx.$queryRaw<{ court_id: string }[]>(Prisma.sql`
        UPDATE bookings SET status = 'expired', updated_at = now()
         WHERE club_id = ${clubId}::uuid AND status = 'held' AND hold_expires_at <= ${now}
        RETURNING court_id`);
      return [...new Set(rows.map((r) => r.court_id))];
    });
  }

  async clubIds(): Promise<string[]> {
    const rows = await this.db.run(PUBLIC, (tx) => tx.club.findMany({ select: { id: true } }));
    return rows.map((r) => r.id);
  }

  /**
   * Inserts under a per-court advisory lock: concurrent attempts on one court queue up instead
   * of racing in the gist index (which deadlocks and waits `deadlock_timeout` each time). The
   * exclusion constraint stays the guarantee; the lock only makes losers fail fast with 23P01.
   */
  async createHold(hold: NewHold): Promise<StoredBooking> {
    try {
      return await this.insertHold(hold);
    } catch (error) {
      if (isExclusionViolation(error)) throw new SlotTakenError();
      throw error;
    }
  }

  private async insertHold(hold: NewHold): Promise<StoredBooking> {
    {
      return await this.db.run({ role: 'player', userId: hold.userId }, async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${hold.courtId}, 0))`;
        // `createMany` sends no RETURNING: the select policy cannot see a row of its own statement.
        await tx.booking.createMany({
          data: {
            id: hold.id,
            clubId: hold.clubId,
            courtId: hold.courtId,
            startsAt: hold.startsAt,
            endsAt: hold.endsAt,
            status: hold.holdExpiresAt ? 'held' : 'confirmed',
            priceCents: hold.priceCents,
            origin: 'app',
            holdExpiresAt: hold.holdExpiresAt,
            createdByUserId: hold.userId,
          },
        });
        await tx.bookingPlayer.create({
          data: {
            id: newId(),
            clubId: hold.clubId,
            bookingId: hold.id,
            position: 1,
            userId: hold.userId,
            accepted: true,
            acceptedAt: new Date(),
          },
        });
        const booking = await tx.booking.findUniqueOrThrow({ where: { id: hold.id } });
        const user = await tx.user.findUnique({
          where: { id: hold.userId },
          select: { name: true },
        });
        return { booking, playerName: user?.name ?? '' };
      });
    }
  }

  async findForPlayer(userId: string, bookingId: string): Promise<StoredBooking | null> {
    return this.db.run({ role: 'player', userId }, async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) return null;
      const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
      return { booking, playerName: user?.name ?? '' };
    });
  }
}
