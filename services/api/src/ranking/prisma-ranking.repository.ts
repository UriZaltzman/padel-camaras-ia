import { Injectable } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service';
import { RankingRepository, type RankingRow } from './ranking.repository';

@Injectable()
export class PrismaRankingRepository extends RankingRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  isParticipant(userId: string, clubId: string): Promise<boolean> {
    return this.db.run({ role: 'player', userId }, async (tx) => {
      const member = await tx.membership.count({ where: { userId, clubId, status: 'active' } });
      if (member > 0) return true;
      return (await tx.matchPlayer.count({ where: { userId, clubId, confirmed: true } })) > 0;
    });
  }

  rows(clubId: string, since: Date): Promise<RankingRow[]> {
    return this.db.run({ role: 'system', clubId }, async (tx) => {
      const played = await tx.matchPlayer.findMany({
        where: {
          clubId,
          confirmed: true,
          userId: { not: null },
          match: { clubId, type: 'match', winnerTeam: { not: null }, startsAt: { gte: since } },
        },
        select: { userId: true, team: true, match: { select: { winnerTeam: true } } },
      });
      const byUser = new Map<string, { matches: number; wins: number }>();
      for (const p of played) {
        if (p.userId === null) continue;
        const s = byUser.get(p.userId) ?? { matches: 0, wins: 0 };
        s.matches += 1;
        if (p.match.winnerTeam === p.team) s.wins += 1;
        byUser.set(p.userId, s);
      }
      const ids = [...byUser.keys()];
      const users = await tx.user.findMany({
        where: { id: { in: ids }, deletionRequestedAt: null },
        select: { id: true, name: true, photoUrl: true, rating: true },
      });
      return users.flatMap((u) => {
        const s = byUser.get(u.id);
        if (!u.rating || !s) return [];
        return [
          {
            userId: u.id,
            name: u.name,
            photoUrl: u.photoUrl,
            rating: u.rating.rating.toNumber(),
            matchesRated: u.rating.matchesRated,
            matches: s.matches,
            wins: s.wins,
          },
        ];
      });
    });
  }
}
