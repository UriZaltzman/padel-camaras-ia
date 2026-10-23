import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { newId } from '../db/ids';
import { PrismaService } from '../db/prisma.service';
import {
  FavoritesRepository,
  type FavoriteBookingRecord,
  type FavoriteClubRecord,
} from './favorites.repository';

@Injectable()
export class PrismaFavoritesRepository extends FavoritesRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  list(userId: string): Promise<FavoriteClubRecord[]> {
    return this.db.run({ role: 'player', userId }, async (tx) => {
      const rows = await tx.playerFavoriteClub.findMany({
        where: { userId },
        orderBy: { position: 'asc' },
        include: { club: true },
      });
      return rows.map((r) => ({
        clubId: r.clubId,
        name: r.club.name,
        address: r.club.address,
        logoUrl: r.club.logoUrl,
        timezone: r.club.timezone,
        position: r.position,
      }));
    });
  }

  add(userId: string, clubId: string, max: number) {
    return this.db.run({ role: 'player', userId }, async (tx) => {
      if (!(await tx.club.findUnique({ where: { id: clubId }, select: { id: true } }))) {
        return 'no_club' as const;
      }
      const mine = await tx.playerFavoriteClub.findMany({ where: { userId } });
      if (mine.some((f) => f.clubId === clubId)) return 'exists' as const;
      if (mine.length >= max) return 'full' as const;
      try {
        await tx.playerFavoriteClub.create({
          data: { id: newId(), userId, clubId, position: mine.length },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          return 'exists' as const;
        }
        throw e;
      }
      return 'added' as const;
    });
  }

  remove(userId: string, clubId: string): Promise<boolean> {
    return this.db.run({ role: 'player', userId }, async (tx) => {
      const { count } = await tx.playerFavoriteClub.deleteMany({ where: { userId, clubId } });
      if (count === 0) return false;
      const left = await tx.playerFavoriteClub.findMany({
        where: { userId },
        orderBy: { position: 'asc' },
      });
      for (const [position, f] of left.entries()) {
        if (f.position !== position) {
          await tx.playerFavoriteClub.update({ where: { id: f.id }, data: { position } });
        }
      }
      return true;
    });
  }

  reorder(userId: string, clubIds: string[]): Promise<boolean> {
    return this.db.run({ role: 'player', userId }, async (tx) => {
      const mine = await tx.playerFavoriteClub.findMany({ where: { userId } });
      const same =
        mine.length === clubIds.length &&
        new Set(clubIds).size === clubIds.length &&
        mine.every((f) => clubIds.includes(f.clubId));
      if (!same) return false;
      for (const [position, clubId] of clubIds.entries()) {
        await tx.playerFavoriteClub.updateMany({ where: { userId, clubId }, data: { position } });
      }
      return true;
    });
  }

  activeCourts(clubId: string) {
    return this.db.run({ role: 'player' }, (tx) =>
      tx.court.findMany({
        where: { clubId, status: 'active' },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    );
  }

  upcomingBookings(
    userId: string,
    clubIds: string[],
    now: Date,
    perClub: number,
  ): Promise<FavoriteBookingRecord[]> {
    return this.db.run({ role: 'player', userId }, async (tx) => {
      const rows = await tx.booking.findMany({
        where: {
          clubId: { in: clubIds },
          endsAt: { gt: now },
          OR: [{ status: 'confirmed' }, { status: 'held', holdExpiresAt: { gt: now } }],
          players: { some: { userId, OR: [{ position: 1 }, { accepted: true }] } },
        },
        orderBy: { startsAt: 'asc' },
        include: { court: { select: { name: true } } },
      });
      const taken = new Map<string, number>();
      return rows
        .filter((b) => {
          const n = (taken.get(b.clubId) ?? 0) + 1;
          taken.set(b.clubId, n);
          return n <= perClub;
        })
        .map((b) => ({
          id: b.id,
          clubId: b.clubId,
          courtId: b.courtId,
          courtName: b.court.name,
          startsAt: b.startsAt,
          endsAt: b.endsAt,
          status: b.status as 'held' | 'confirmed',
        }));
    });
  }

  countFor(ctx: { role: 'staff' | 'owner'; userId: string; clubId: string }): Promise<number> {
    return this.db.run(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ n: number }[]>(
        Prisma.sql`SELECT app_favorite_count(${ctx.clubId}::uuid) AS n`,
      );
      return rows[0]?.n ?? 0;
    });
  }
}
