import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { newId } from '../db/ids';
import { PrismaService } from '../db/prisma.service';
import type { SetScore } from '../matches/score';
import type { Glicko } from './glicko2';
import type { Category } from './rating-config';
import {
  RatingsRepository,
  type PlayerRating,
  type RatedMatch,
  type RatingUpdate,
} from './ratings.repository';

@Injectable()
export class PrismaRatingsRepository extends RatingsRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  findMatch(matchId: string): Promise<RatedMatch | null> {
    return this.db.run({ role: 'system' }, async (tx) => {
      const m = await tx.match.findUnique({
        where: { id: matchId },
        select: {
          type: true,
          winnerTeam: true,
          finalScore: true,
          players: { select: { userId: true, team: true, confirmed: true } },
        },
      });
      if (!m) return null;
      return {
        type: m.type,
        winnerTeam: m.winnerTeam === 1 || m.winnerTeam === 2 ? m.winnerTeam : null,
        sets: (m.finalScore ?? []) as unknown as SetScore[],
        players: m.players
          .filter((p) => p.confirmed)
          .map((p) => ({ userId: p.userId, team: p.team === 1 ? (1 as const) : (2 as const) })),
      };
    });
  }

  withRatings(
    userIds: readonly string[],
    startingFor: (declared: Category | null) => Glicko,
    compute: (current: Map<string, PlayerRating>) => RatingUpdate[],
  ): Promise<void> {
    const ids = [...new Set(userIds)].sort();
    return this.db.run({ role: 'system' }, async (tx) => {
      const users = await tx.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, declaredCategory: true },
      });
      for (const u of users) {
        const s = startingFor(u.declaredCategory);
        await tx.rating.upsert({
          where: { userId: u.id },
          create: {
            id: newId(),
            userId: u.id,
            rating: s.rating,
            deviation: s.deviation,
            volatility: s.volatility,
          },
          update: {},
        });
      }
      // Lock in id order so two matches sharing players cannot deadlock or lose updates.
      await tx.$queryRaw`SELECT 1 FROM ratings WHERE user_id IN (${Prisma.join(ids)}::uuid[]) ORDER BY user_id FOR UPDATE`;
      const rows = await tx.rating.findMany({ where: { userId: { in: ids } } });
      const current = new Map<string, PlayerRating>(
        rows.map((r) => [
          r.userId,
          {
            rating: r.rating.toNumber(),
            deviation: r.deviation.toNumber(),
            volatility: r.volatility.toNumber(),
            matchesRated: r.matchesRated,
            category: r.category,
          },
        ]),
      );
      for (const u of compute(current)) {
        await tx.rating.update({
          where: { userId: u.userId },
          data: {
            rating: u.rating,
            deviation: u.deviation,
            volatility: u.volatility,
            matchesRated: u.matchesRated,
            category: u.category,
          },
        });
      }
    });
  }

  find(userId: string): Promise<PlayerRating | null> {
    return this.db.run({ role: 'player', userId }, async (tx) => {
      const r = await tx.rating.findUnique({ where: { userId } });
      if (!r) return null;
      return {
        rating: r.rating.toNumber(),
        deviation: r.deviation.toNumber(),
        volatility: r.volatility.toNumber(),
        matchesRated: r.matchesRated,
        category: r.category,
      };
    });
  }
}
