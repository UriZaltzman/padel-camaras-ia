import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OCCUPYING_STATUSES } from '../bookings/booking-policy';
import type { DbContext } from '../db/db-context';
import { newId } from '../db/ids';
import { PrismaService } from '../db/prisma.service';
import type { Interval, PointsConfig, SetResult } from './tournament-draw';
import {
  TournamentsRepository,
  type Confirmation,
  type DrawOutcome,
  type DrawPlan,
  type GroupRow,
  type MatchRow,
  type NewPair,
  type PairRow,
  type RankingRow,
  type Report,
  type TournamentRow,
  type UserInfo,
} from './tournaments.repository';

function isExclusionViolation(error: unknown): boolean {
  const text =
    error instanceof Error
      ? `${error.message} ${JSON.stringify((error as { meta?: unknown }).meta ?? '')}`
      : '';
  return /23P01|bookings_no_overlap_excl|exclusion constraint/i.test(text);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

const asSets = (v: Prisma.JsonValue | null): SetResult[] | null =>
  v ? (v as unknown as SetResult[]) : null;

@Injectable()
export class PrismaTournamentsRepository extends TournamentsRepository {
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

  private toTournament(
    t: Prisma.TournamentGetPayload<{ include: { _count: { select: { registrations: true } } } }>,
    pairCount: number,
  ): TournamentRow {
    return {
      id: t.id,
      clubId: t.clubId,
      name: t.name,
      category: t.category,
      status: t.status,
      entryFeeCents: t.entryFeeCents,
      matchMinutes: t.matchMinutes,
      points: t.pointsConfig as unknown as PointsConfig,
      pairCount,
    };
  }

  list(ctx: DbContext, clubId: string): Promise<TournamentRow[]> {
    return this.db.run(ctx, async (tx) => {
      const rows = await tx.tournament.findMany({
        where: { clubId },
        include: { _count: { select: { registrations: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const active = await tx.tournamentRegistration.groupBy({
        by: ['tournamentId'],
        where: { clubId, withdrawnAt: null },
        _count: { _all: true },
      });
      const counts = new Map(active.map((a) => [a.tournamentId, a._count._all]));
      return rows.map((r) => this.toTournament(r, counts.get(r.id) ?? 0));
    });
  }

  find(ctx: DbContext, clubId: string, id: string): Promise<TournamentRow | null> {
    return this.db.run(ctx, async (tx) => {
      const row = await tx.tournament.findFirst({
        where: { id, clubId },
        include: { _count: { select: { registrations: true } } },
      });
      if (!row) return null;
      const count = await tx.tournamentRegistration.count({
        where: { tournamentId: id, withdrawnAt: null },
      });
      return this.toTournament(row, count);
    });
  }

  async create(
    ctx: DbContext,
    row: Omit<TournamentRow, 'status' | 'pairCount'> & { createdByUserId: string },
  ): Promise<void> {
    await this.db.run(ctx, (tx) =>
      tx.tournament.create({
        data: {
          id: row.id,
          clubId: row.clubId,
          name: row.name,
          category: row.category,
          entryFeeCents: row.entryFeeCents,
          matchMinutes: row.matchMinutes,
          pointsConfig: row.points as unknown as Prisma.InputJsonValue,
          createdByUserId: row.createdByUserId,
        },
      }),
    );
  }

  async pairs(ctx: DbContext, tournamentId: string): Promise<PairRow[]> {
    return this.db.run(ctx, async (tx) => {
      const rows = await tx.tournamentRegistration.findMany({
        where: { tournamentId, withdrawnAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const users = await tx.user.findMany({
        where: { id: { in: rows.flatMap((r) => [r.player1UserId, r.player2UserId]) } },
        select: { id: true, name: true },
      });
      const name = new Map(users.map((u) => [u.id, u.name]));
      return rows.map((r) => ({
        id: r.id,
        players: [
          { userId: r.player1UserId, name: name.get(r.player1UserId) ?? '' },
          { userId: r.player2UserId, name: name.get(r.player2UserId) ?? '' },
        ] as PairRow['players'],
        strength: r.strength,
        seed: r.seed,
        groupId: r.groupId,
        paid: r.paid,
        createdAt: r.createdAt,
      }));
    });
  }

  groups(ctx: DbContext, tournamentId: string): Promise<GroupRow[]> {
    return this.db.run(ctx, async (tx) =>
      (
        await tx.tournamentGroup.findMany({ where: { tournamentId }, orderBy: { position: 'asc' } })
      ).map((g) => ({ id: g.id, position: g.position })),
    );
  }

  matches(ctx: DbContext, tournamentId: string): Promise<MatchRow[]> {
    return this.db.run(ctx, async (tx) =>
      (
        await tx.tournamentMatch.findMany({
          where: { tournamentId },
          orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        })
      ).map((m) => ({
        id: m.id,
        stage: m.stage,
        groupId: m.groupId,
        round: m.round,
        bracketKey: m.bracketKey,
        pairAId: m.pairAId,
        pairBId: m.pairBId,
        nextMatchId: m.nextMatchId,
        nextSide: m.nextSide as 'a' | 'b' | null,
        courtId: m.courtId,
        startsAt: m.startsAt,
        endsAt: m.endsAt,
        status: m.status,
        sets: asSets(m.sets),
        winnerPairId: m.winnerPairId,
        reportedByUserId: m.reportedByUserId,
      })),
    );
  }

  users(ctx: DbContext, userIds: string[]): Promise<UserInfo[]> {
    return this.db.run(ctx, async (tx) =>
      (
        await tx.user.findMany({
          where: { id: { in: userIds }, deletionRequestedAt: null },
          select: { id: true, name: true, rating: { select: { rating: true } } },
        })
      ).map((u) => ({
        userId: u.id,
        name: u.name,
        rating: u.rating ? u.rating.rating.toNumber() : null,
      })),
    );
  }

  async addPair(ctx: DbContext, pair: NewPair): Promise<'ok' | 'closed' | 'taken'> {
    try {
      return await this.db.run(ctx, async (tx) => {
        // Lock the tournament so a registration cannot slip in while the draw is made.
        const [row] = await tx.$queryRaw<{ status: string }[]>`
          SELECT status::text FROM tournaments WHERE id = ${pair.tournamentId}::uuid FOR UPDATE`;
        if (row?.status !== 'registration') return 'closed' as const;
        const clash = await tx.tournamentRegistration.count({
          where: {
            tournamentId: pair.tournamentId,
            withdrawnAt: null,
            OR: [
              { player1UserId: { in: [pair.player1UserId, pair.player2UserId] } },
              { player2UserId: { in: [pair.player1UserId, pair.player2UserId] } },
            ],
          },
        });
        if (clash > 0) return 'taken' as const;
        await tx.tournamentRegistration.create({
          data: { ...pair, clubId: ctx.clubId as string },
        });
        return 'ok' as const;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return 'taken';
      throw error;
    }
  }

  withdraw(ctx: DbContext, pairId: string, now: Date): Promise<'ok' | 'closed' | 'missing'> {
    return this.db.run(ctx, async (tx) => {
      const reg = await tx.tournamentRegistration.findFirst({
        where: { id: pairId, withdrawnAt: null },
        select: { tournamentId: true },
      });
      if (!reg) return 'missing' as const;
      const [row] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status::text FROM tournaments WHERE id = ${reg.tournamentId}::uuid FOR UPDATE`;
      if (row?.status !== 'registration') return 'closed' as const;
      await tx.tournamentRegistration.update({ where: { id: pairId }, data: { withdrawnAt: now } });
      return 'ok' as const;
    });
  }

  async markPaid(ctx: DbContext, pairId: string, now: Date): Promise<boolean> {
    const { count } = await this.db.run(ctx, (tx) =>
      tx.tournamentRegistration.updateMany({
        where: { id: pairId, withdrawnAt: null, paid: false },
        data: { paid: true, paidAt: now },
      }),
    );
    return count > 0;
  }

  async activeCourts(ctx: DbContext, clubId: string, ids: string[]): Promise<string[]> {
    return (
      await this.db.run(ctx, (tx) =>
        tx.court.findMany({
          where: { clubId, status: 'active', id: { in: ids } },
          select: { id: true },
        }),
      )
    ).map((c) => c.id);
  }

  async busy(
    ctx: DbContext,
    courtIds: string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, Interval[]>> {
    const rows = await this.db.run(ctx, (tx) =>
      tx.booking.findMany({
        where: {
          courtId: { in: courtIds },
          startsAt: { lt: to },
          endsAt: { gt: from },
          status: { in: [...OCCUPYING_STATUSES] },
        },
        select: { courtId: true, startsAt: true, endsAt: true },
      }),
    );
    const out = new Map<string, Interval[]>();
    for (const r of rows) {
      out.set(r.courtId, [
        ...(out.get(r.courtId) ?? []),
        { start: r.startsAt.getTime(), end: r.endsAt.getTime() },
      ]);
    }
    return out;
  }

  async applyDraw(ctx: DbContext, plan: DrawPlan, actorUserId: string): Promise<DrawOutcome> {
    const clubId = ctx.clubId as string;
    try {
      return await this.db.run(ctx, async (tx) => {
        const [row] = await tx.$queryRaw<{ status: string }[]>`
          SELECT status::text FROM tournaments WHERE id = ${plan.tournamentId}::uuid FOR UPDATE`;
        if (row?.status !== 'registration') return 'closed' as const;
        await tx.tournamentGroup.createMany({
          data: plan.groups.map((g) => ({
            id: g.id,
            clubId,
            tournamentId: plan.tournamentId,
            position: g.position,
          })),
        });
        for (const p of plan.pairs) {
          await tx.tournamentRegistration.update({
            where: { id: p.id },
            data: { strength: p.strength, seed: p.seed, groupId: p.groupId },
          });
        }
        // Matches reference each other (`next_match_id`), so the rows go in first and the links after.
        for (const m of plan.matches) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${m.courtId}, 0))`;
          const booking = await tx.booking.create({
            data: {
              id: newId(),
              clubId,
              courtId: m.courtId,
              startsAt: m.startsAt,
              endsAt: m.endsAt,
              status: 'confirmed',
              priceCents: 0,
              origin: 'tournament',
              createdByUserId: actorUserId,
              noRecord: false,
            },
          });
          await tx.tournamentMatch.create({
            data: {
              id: m.id,
              clubId,
              tournamentId: plan.tournamentId,
              stage: m.stage,
              groupId: m.groupId,
              round: m.round,
              bracketKey: m.bracketKey,
              pairAId: m.pairAId,
              pairBId: m.pairBId,
              nextSide: m.nextSide,
              bookingId: booking.id,
              startsAt: m.startsAt,
              endsAt: m.endsAt,
              courtId: m.courtId,
            },
          });
        }
        for (const m of plan.matches) {
          if (m.nextMatchId) {
            await tx.tournamentMatch.update({
              where: { id: m.id },
              data: { nextMatchId: m.nextMatchId },
            });
          }
        }
        await tx.tournament.update({
          where: { id: plan.tournamentId },
          data: { status: 'in_progress' },
        });
        return 'ok' as const;
      });
    } catch (error) {
      if (isExclusionViolation(error)) return 'slots';
      throw error;
    }
  }

  async report(ctx: DbContext, report: Report): Promise<boolean> {
    const { count } = await this.db.run(ctx, (tx) =>
      tx.tournamentMatch.updateMany({
        where: { id: report.matchId, status: { not: 'confirmed' } },
        data: {
          status: 'awaiting_confirmation',
          sets: report.sets as unknown as Prisma.InputJsonValue,
          winnerPairId: report.winnerPairId,
          reportedByUserId: report.reportedByUserId,
        },
      }),
    );
    return count > 0;
  }

  confirm(ctx: DbContext, c: Confirmation, now: Date): Promise<boolean> {
    const clubId = ctx.clubId as string;
    return this.db.run(ctx, async (tx) => {
      const { count } = await tx.tournamentMatch.updateMany({
        where: { id: c.matchId, status: 'awaiting_confirmation' },
        data: { status: 'confirmed', confirmedByUserId: c.confirmedByUserId, confirmedAt: now },
      });
      if (count === 0) return false;
      for (const s of c.slots) {
        await tx.tournamentMatch.update({
          where: { id: s.matchId },
          data: s.side === 'a' ? { pairAId: s.pairId } : { pairBId: s.pairId },
        });
      }
      if (c.finish) {
        await tx.tournamentPoint.createMany({
          data: c.finish.points.map((p) => ({
            id: newId(),
            clubId,
            tournamentId: c.tournamentId,
            userId: p.userId,
            points: p.points,
            awardedAt: now,
          })),
          skipDuplicates: true,
        });
        await tx.tournament.update({
          where: { id: c.tournamentId },
          data: { status: 'finished', finishedAt: now },
        });
      }
      return true;
    });
  }

  async ranking(
    ctx: DbContext,
    clubId: string,
    category: number,
    since: Date,
  ): Promise<RankingRow[]> {
    return this.db.run(ctx, async (tx) => {
      const rows = await tx.tournamentPoint.findMany({
        where: { clubId, awardedAt: { gte: since }, tournament: { category } },
        select: { userId: true, points: true },
      });
      const sum = new Map<string, { points: number; tournaments: number }>();
      for (const r of rows) {
        const s = sum.get(r.userId) ?? { points: 0, tournaments: 0 };
        s.points += r.points;
        s.tournaments += 1;
        sum.set(r.userId, s);
      }
      const users = await tx.user.findMany({
        where: { id: { in: [...sum.keys()] }, deletionRequestedAt: null },
        select: { id: true, name: true },
      });
      return users.flatMap((u) => {
        const s = sum.get(u.id);
        return s ? [{ userId: u.id, name: u.name, ...s }] : [];
      });
    });
  }
}
