import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { newId } from '../db/ids';
import { PrismaService } from '../db/prisma.service';
import type { MatchStatus } from './match-transitions';
import {
  MatchesRepository,
  type Actor,
  type ClaimResult,
  type Correction,
  type MatchRecord,
} from './matches.repository';
import type { SetScore } from './score';

/** Points under this confidence go to the players for review (`ml/config/thresholds.yaml`). */
const REVIEW_BELOW = 0.7;

@Injectable()
export class PrismaMatchesRepository extends MatchesRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  async staffClubs(userId: string): Promise<{ clubId: string; role: 'staff' | 'owner' }[]> {
    const rows = await this.db.run({ role: 'player', userId }, (tx) =>
      tx.membership.findMany({
        where: { userId, status: 'active', role: { in: ['staff', 'owner'] } },
        select: { clubId: true, role: true },
      }),
    );
    return rows.map((r) => ({ clubId: r.clubId, role: r.role as 'staff' | 'owner' }));
  }

  find(actor: Actor, matchId: string): Promise<MatchRecord | null> {
    return this.db.run(actor, async (tx) => {
      const m = await tx.match.findUnique({
        where: { id: matchId },
        include: {
          club: { select: { name: true } },
          court: { select: { name: true } },
          players: { include: { user: { select: { name: true, photoUrl: true } } } },
        },
      });
      if (!m) return null;
      const isPlayer = actor.role === 'player';
      const [points, insights] = isPlayer
        ? await Promise.all([
            tx.point.findMany({
              where: { matchId, confidence: { lt: REVIEW_BELOW }, correctedByUser: false },
              orderBy: { number: 'asc' },
            }),
            tx.insight.findMany({
              where: { matchId, userId: actor.userId },
              orderBy: { position: 'asc' },
            }),
          ])
        : [[], []];
      return {
        id: m.id,
        clubId: m.clubId,
        clubName: m.club.name,
        courtId: m.courtId,
        courtName: m.court.name,
        bookingId: m.bookingId,
        type: m.type as 'match' | 'lesson',
        status: m.status as MatchStatus,
        startsAt: m.startsAt,
        endsAt: m.endsAt,
        goldenPoint: m.goldenPoint,
        bestOfSets: m.bestOfSets,
        superTiebreak: m.superTiebreak,
        sets: (m.finalScore as SetScore[] | null) ?? [],
        winnerTeam: m.winnerTeam as 1 | 2 | null,
        players: m.players
          .map((p) => ({
            position: p.trackIndex + 1,
            team: p.team as 1 | 2,
            userId: p.userId,
            displayName: p.user?.name ?? null,
            photoUrl: p.user?.photoUrl ?? null,
            confirmed: p.confirmed,
          }))
          .sort((a, b) => a.position - b.position),
        pointsToReview: points.map((p) => ({
          id: p.id,
          number: p.number,
          set: p.setNumber,
          game: p.gameNumber,
          winnerTeam: p.winnerTeam as 1 | 2,
          endReason: p.endReason,
          confidence: Number(p.confidence),
        })),
        insights: insights.map((i) => ({
          id: i.id,
          kind: i.type,
          text: i.text,
          order: i.position,
        })),
      };
    });
  }

  locate(matchId: string): Promise<{ clubId: string; status: MatchStatus } | null> {
    return this.db.run({ role: 'system' }, async (tx) => {
      const m = await tx.match.findUnique({
        where: { id: matchId },
        select: { clubId: true, status: true },
      });
      return m ? { clubId: m.clubId, status: m.status as MatchStatus } : null;
    });
  }

  mayClaim(matchId: string, userId: string): Promise<boolean> {
    return this.db.run({ role: 'system' }, async (tx) => {
      const m = await tx.match.findUnique({
        where: { id: matchId },
        select: { bookingId: true },
      });
      if (!m) return false;
      const [joined, booked] = await Promise.all([
        tx.matchPlayer.count({ where: { matchId, userId } }),
        m.bookingId ? tx.bookingPlayer.count({ where: { bookingId: m.bookingId, userId } }) : 0,
      ]);
      return joined + booked > 0;
    });
  }

  claim(
    clubId: string,
    matchId: string,
    position: number,
    userId: string,
    now: Date,
  ): Promise<ClaimResult> {
    return this.db.run({ role: 'system', clubId }, async (tx) => {
      try {
        const r = await tx.matchPlayer.updateMany({
          where: { matchId, trackIndex: position - 1, userId: null },
          data: { userId, confirmed: true, confirmedAt: now },
        });
        if (r.count === 1) return 'claimed';
        const slot = await tx.matchPlayer.findFirst({
          where: { matchId, trackIndex: position - 1 },
        });
        if (slot?.userId === userId) return 'claimed';
        return 'slot_taken';
      } catch (e) {
        // `@@unique([matchId, userId])`: the user already holds another position.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          return 'already_joined';
        }
        throw e;
      }
    });
  }

  isConfirmedPlayer(matchId: string, userId: string): Promise<boolean> {
    return this.db.run({ role: 'system' }, async (tx) => {
      return (await tx.matchPlayer.count({ where: { matchId, userId, confirmed: true } })) > 0;
    });
  }

  applyCorrection(
    clubId: string,
    matchId: string,
    correction: Correction,
    now: Date,
  ): Promise<{ id: string } | 'no_point' | 'moved'> {
    return this.db
      .run({ role: 'system', clubId }, async (tx) => {
        const moved = await tx.match.updateMany({
          where: { id: matchId, status: 'published' },
          data:
            correction.type === 'final_score'
              ? {
                  status: 'needs_review',
                  finalScore: correction.sets as unknown as Prisma.InputJsonValue,
                  winnerTeam: correction.winnerTeam,
                }
              : { status: 'needs_review' },
        });
        if (moved.count !== 1) return 'moved';
        if (correction.type === 'point_winner') {
          const r = await tx.point.updateMany({
            where: { id: correction.pointId, matchId },
            data: { winnerTeam: correction.winnerTeam, correctedByUser: true, correctedAt: now },
          });
          if (r.count !== 1) {
            // Roll the whole transaction back: nothing was corrected.
            throw new NoPoint();
          }
        }
        return { id: newId() };
      })
      .catch((e: unknown) => {
        if (e instanceof NoPoint) return 'no_point' as const;
        throw e;
      });
  }
}

class NoPoint extends Error {}
