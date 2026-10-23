import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DbContext } from '../db/db-context';
import { PrismaService } from '../db/prisma.service';
import { OCCUPYING_STATUSES } from './booking-policy';
import { SlotTakenError } from './bookings.repository';
import {
  CourtBlocksRepository,
  type BlockCourt,
  type ConflictingBooking,
  type NewBlock,
  type StoredBlock,
} from './court-blocks.repository';

function isExclusionViolation(error: unknown): boolean {
  const text =
    error instanceof Error
      ? `${error.message} ${JSON.stringify((error as { meta?: unknown }).meta ?? '')}`
      : '';
  return /23P01|bookings_no_overlap_excl|exclusion constraint/i.test(text);
}

@Injectable()
export class PrismaCourtBlocksRepository extends CourtBlocksRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  async courts(ctx: DbContext, clubId: string, courtIds: string[]): Promise<BlockCourt[]> {
    const rows = await this.db.run(ctx, (tx) =>
      tx.court.findMany({
        where: { clubId, id: { in: courtIds } },
        select: { id: true, status: true, club: { select: { timezone: true } } },
      }),
    );
    return rows.map((r) => ({ id: r.id, status: r.status, timezone: r.club.timezone }));
  }

  async expireHolds(ctx: DbContext, clubId: string, now: Date): Promise<void> {
    await this.db.run(ctx, (tx) =>
      tx.booking.updateMany({
        where: { clubId, status: 'held', holdExpiresAt: { lte: now } },
        data: { status: 'expired' },
      }),
    );
  }

  async conflicts(
    ctx: DbContext,
    courtId: string,
    from: Date,
    to: Date,
  ): Promise<ConflictingBooking[]> {
    const rows = await this.db.run(ctx, (tx) =>
      tx.booking.findMany({
        where: {
          courtId,
          startsAt: { lt: to },
          endsAt: { gt: from },
          status: { in: [...OCCUPYING_STATUSES] },
        },
        include: { players: { where: { position: 1 }, select: { userId: true } } },
        orderBy: { startsAt: 'asc' },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      courtId: r.courtId,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      status: r.status as ConflictingBooking['status'],
      isBlock: r.origin === 'block',
      playerUserId: r.players[0]?.userId ?? r.createdByUserId,
    }));
  }

  async freeCourts(
    ctx: DbContext,
    clubId: string,
    exceptCourtIds: string[],
    from: Date,
    to: Date,
  ): Promise<string[]> {
    const rows = await this.db.run(ctx, (tx) =>
      tx.court.findMany({
        where: {
          clubId,
          status: 'active',
          id: { notIn: exceptCourtIds },
          bookings: {
            none: {
              startsAt: { lt: to },
              endsAt: { gt: from },
              status: { in: [...OCCUPYING_STATUSES] },
            },
          },
        },
        select: { id: true },
        orderBy: { name: 'asc' },
      }),
    );
    return rows.map((r) => r.id);
  }

  async moveBooking(ctx: DbContext, bookingId: string, courtId: string): Promise<void> {
    try {
      await this.db.run(ctx, async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${courtId}, 0))`;
        await tx.booking.update({ where: { id: bookingId }, data: { courtId } });
      });
    } catch (error) {
      if (isExclusionViolation(error)) throw new SlotTakenError();
      throw error;
    }
  }

  async cancelHold(ctx: DbContext, bookingId: string, now: Date): Promise<void> {
    await this.db.run(ctx, (tx) =>
      tx.booking.updateMany({
        where: { id: bookingId, status: 'held' },
        data: { status: 'cancelled', cancelledAt: now },
      }),
    );
  }

  async insert(ctx: DbContext, block: NewBlock): Promise<StoredBlock> {
    try {
      await this.db.run(ctx, async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${block.courtId}, 0))`,
        );
        // `createMany` sends no RETURNING: the select policy cannot see a row of its own statement.
        await tx.booking.createMany({
          data: {
            id: block.id,
            clubId: block.clubId,
            courtId: block.courtId,
            startsAt: block.startsAt,
            endsAt: block.endsAt,
            status: 'confirmed',
            priceCents: 0,
            origin: 'block',
            createdByUserId: block.createdByUserId,
            noRecord: true,
          },
        });
        await tx.courtBlock.createMany({
          data: {
            id: block.id,
            clubId: block.clubId,
            bookingId: block.id,
            kind: block.kind,
            reason: block.reason,
            seriesId: block.seriesId,
          },
        });
      });
    } catch (error) {
      if (isExclusionViolation(error)) throw new SlotTakenError();
      throw error;
    }
    return block;
  }

  async list(ctx: DbContext, clubId: string, from: Date, to: Date): Promise<StoredBlock[]> {
    const rows = await this.db.run(ctx, (tx) =>
      tx.courtBlock.findMany({
        where: { clubId, booking: { startsAt: { lt: to }, endsAt: { gt: from } } },
        include: { booking: { select: { courtId: true, startsAt: true, endsAt: true } } },
        orderBy: { booking: { startsAt: 'asc' } },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      clubId: r.clubId,
      courtId: r.booking.courtId,
      startsAt: r.booking.startsAt,
      endsAt: r.booking.endsAt,
      kind: r.kind,
      reason: r.reason,
      seriesId: r.seriesId,
    }));
  }

  async remove(ctx: DbContext, clubId: string, blockId: string): Promise<boolean> {
    const { count } = await this.db.run(ctx, (tx) =>
      tx.booking.deleteMany({ where: { id: blockId, clubId, origin: 'block' } }),
    );
    return count > 0;
  }
}
