import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { DbContext } from '../db/db-context';
import { PrismaService } from '../db/prisma.service';
import {
  LessonRequestsRepository,
  type LessonRequestQuery,
  type LessonRequestRecord,
  type LessonRequestStatus,
  type NewLessonRequest,
} from './lesson-requests.repository';

const system = (clubId: string): DbContext => ({ role: 'system', clubId });

const include = {
  club: { select: { name: true } },
  coach: { select: { id: true, name: true } },
  student: { select: { id: true, name: true } },
  court: { select: { name: true } },
} satisfies Prisma.LessonRequestInclude;
type Row = Prisma.LessonRequestGetPayload<{ include: typeof include }>;

function toRecord(row: Row): LessonRequestRecord {
  return {
    id: row.id,
    clubId: row.clubId,
    clubName: row.club.name,
    coach: row.coach,
    student: row.student,
    courtId: row.courtId,
    courtName: row.court.name,
    startsAt: row.startsAt,
    durationMinutes: row.durationMinutes,
    message: row.message,
    status: row.status as LessonRequestStatus,
    reason: row.reason,
    lessonId: row.lessonId,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaLessonRequestsRepository extends LessonRequestsRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  async phoneOf(clubId: string, userId: string): Promise<string | null> {
    const user = await this.db.run(system(clubId), (tx) =>
      tx.user.findUnique({ where: { id: userId }, select: { phone: true } }),
    );
    const digits = user?.phone?.replace(/\D/g, '') ?? '';
    return digits.length > 0 ? digits : null;
  }

  async create(request: NewLessonRequest): Promise<LessonRequestRecord> {
    const row = await this.db.run(system(request.clubId), (tx) =>
      tx.lessonRequest.create({ data: request, include }),
    );
    return toRecord(row);
  }

  /**
   * Rows are selected as the user (RLS keeps strangers out) but carry no names: a player cannot
   * read the other party's user row, so the names are loaded as the club's system.
   */
  private async hydrate(ids: { id: string; clubId: string }[]): Promise<LessonRequestRecord[]> {
    const out = new Map<string, LessonRequestRecord>();
    for (const clubId of new Set(ids.map((r) => r.clubId))) {
      const rows = await this.db.run(system(clubId), (tx) =>
        tx.lessonRequest.findMany({
          where: { clubId, id: { in: ids.filter((r) => r.clubId === clubId).map((r) => r.id) } },
          include,
        }),
      );
      for (const row of rows) out.set(row.id, toRecord(row));
    }
    return ids.flatMap((r) => out.get(r.id) ?? []);
  }

  async find(userId: string, id: string): Promise<LessonRequestRecord | null> {
    const row = await this.db.run({ role: 'player', userId }, (tx) =>
      tx.lessonRequest.findUnique({ where: { id }, select: { id: true, clubId: true } }),
    );
    return row ? ((await this.hydrate([row]))[0] ?? null) : null;
  }

  async list(query: LessonRequestQuery): Promise<LessonRequestRecord[]> {
    const { role, userId } = query.as;
    const rows = await this.db.run({ role: 'player', userId }, (tx) =>
      tx.lessonRequest.findMany({
        where: {
          ...(role === 'coach' ? { coachUserId: userId } : { studentUserId: userId }),
          ...(query.status ? { status: query.status } : {}),
          ...(query.after
            ? {
                OR: [
                  { createdAt: { lt: query.after.createdAt } },
                  { createdAt: query.after.createdAt, id: { lt: query.after.id } },
                ],
              }
            : {}),
        },
        select: { id: true, clubId: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      }),
    );
    return this.hydrate(rows);
  }

  async decide(
    clubId: string,
    id: string,
    status: Exclude<LessonRequestStatus, 'pending'>,
    fields: { lessonId?: string; reason?: string | null; now: Date },
  ): Promise<boolean> {
    const result = await this.db.run(system(clubId), (tx) =>
      tx.lessonRequest.updateMany({
        where: { id, clubId, status: 'pending' },
        data: {
          status,
          lessonId: fields.lessonId,
          reason: fields.reason ?? null,
          decidedAt: fields.now,
        },
      }),
    );
    return result.count > 0;
  }
}
