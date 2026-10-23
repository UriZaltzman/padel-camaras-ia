import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DbContext } from '../db/db-context';
import { newId } from '../db/ids';
import { PrismaService, type Tx } from '../db/prisma.service';
import { isExclusionViolation } from '../bookings/prisma-bookings.repository';
import { SlotTakenError } from '../bookings/bookings.repository';
import {
  LessonsRepository,
  UnknownStudentError,
  type CoachAccess,
  type CoachStudentRecord,
  type LessonKind,
  type LessonQuery,
  type LessonRecord,
  type NewLesson,
  type NewNote,
  type NoRecordReason,
  type NoteRecord,
} from './lessons.repository';

const system = (clubId: string): DbContext => ({ role: 'system', clubId });

const lessonInclude = {
  club: { select: { name: true } },
  coach: { select: { id: true, name: true } },
  students: { include: { user: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
  match: { include: { booking: { include: { court: { select: { name: true } } } } } },
  _count: { select: { noteRows: true } },
} satisfies Prisma.LessonInclude;
type LessonRow = Prisma.LessonGetPayload<{ include: typeof lessonInclude }>;

function noRecordReason(row: LessonRow): NoRecordReason | null {
  const booking = row.match.booking;
  if (!booking?.noRecord) return null;
  if (row.kind === 'school') return 'club_school';
  return booking.includesMinors ? 'minor_without_guardian' : 'requested';
}

async function toRecord(tx: Tx, row: LessonRow): Promise<LessonRecord> {
  const booking = row.match.booking;
  if (!booking) throw new Error('lesson without booking');
  const payments = await tx.payment.findMany({
    where: { lessonId: row.id, concept: 'lesson' },
    select: { userId: true, status: true },
    orderBy: { createdAt: 'desc' },
  });
  const statusOf = (userId: string): string | null =>
    payments.find((p) => p.userId === userId)?.status ?? null;
  return {
    id: row.id,
    clubId: row.clubId,
    clubName: row.club.name,
    courtId: booking.courtId,
    courtName: row.match.booking?.court.name ?? '',
    coach: { id: row.coach?.id ?? '', name: row.coach?.name ?? '' },
    kind: row.kind as LessonKind,
    startsAt: row.match.startsAt,
    endsAt: row.match.endsAt,
    bookingId: booking.id,
    bookingStatus: booking.status,
    matchId: row.matchId,
    students: row.students.map((s) => ({
      userId: s.userId,
      name: s.user.name,
      accepted: s.accepted,
      paymentStatus: statusOf(s.userId),
    })),
    priceCents: row.priceCents,
    noRecord: booking.noRecord,
    noRecordReason: noRecordReason(row),
    focus: row.focus,
    notesCount: row._count.noteRows,
  };
}

@Injectable()
export class PrismaLessonsRepository extends LessonsRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  async coachClubIds(userId: string): Promise<string[]> {
    const rows = await this.db.run({ role: 'player', userId }, (tx) =>
      tx.membership.findMany({
        where: { userId, role: 'coach', status: 'active' },
        select: { clubId: true },
      }),
    );
    return rows.map((r) => r.clubId);
  }

  async studentClubIds(userId: string): Promise<string[]> {
    const rows = await this.db.run({ role: 'player', userId }, (tx) =>
      tx.lessonStudent.findMany({
        where: { userId },
        select: { clubId: true },
        distinct: ['clubId'],
      }),
    );
    return rows.map((r) => r.clubId);
  }

  async birthDates(clubId: string, userIds: string[]): Promise<Map<string, Date | null>> {
    const rows = await this.db.run(system(clubId), (tx) =>
      tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, birthDate: true } }),
    );
    return new Map(rows.map((r) => [r.id, r.birthDate]));
  }

  async create(lesson: NewLesson): Promise<LessonRecord> {
    try {
      return await this.db.run(system(lesson.clubId), async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lesson.courtId}, 0))`;
        await tx.booking.createMany({
          data: {
            id: lesson.bookingId,
            clubId: lesson.clubId,
            courtId: lesson.courtId,
            startsAt: lesson.startsAt,
            endsAt: lesson.endsAt,
            status: 'confirmed',
            priceCents: lesson.bookingPriceCents,
            origin: 'app',
            createdByUserId: lesson.coachUserId,
            noRecord: lesson.noRecord,
            includesMinors: lesson.includesMinors,
          },
        });
        await tx.match.createMany({
          data: {
            id: lesson.matchId,
            clubId: lesson.clubId,
            courtId: lesson.courtId,
            bookingId: lesson.bookingId,
            type: 'lesson',
            startsAt: lesson.startsAt,
            endsAt: lesson.endsAt,
          },
        });
        await tx.lesson.createMany({
          data: {
            id: lesson.id,
            clubId: lesson.clubId,
            matchId: lesson.matchId,
            coachUserId: lesson.coachUserId,
            priceCents: lesson.priceCents,
            kind: lesson.kind,
            focus: lesson.focus,
          },
        });
        if (lesson.studentIds.length > 0) {
          const found = await tx.user.count({ where: { id: { in: lesson.studentIds } } });
          if (found !== lesson.studentIds.length) throw new UnknownStudentError();
          await tx.lessonStudent.createMany({
            data: lesson.studentIds.map((userId) => ({
              id: newId(),
              clubId: lesson.clubId,
              lessonId: lesson.id,
              userId,
            })),
          });
        }
        return this.load(tx, lesson.id);
      });
    } catch (error) {
      if (isExclusionViolation(error)) throw new SlotTakenError();
      throw error;
    }
  }

  private async load(tx: Tx, lessonId: string): Promise<LessonRecord> {
    const row = await tx.lesson.findUniqueOrThrow({
      where: { id: lessonId },
      include: lessonInclude,
    });
    return toRecord(tx, row);
  }

  async find(clubId: string, lessonId: string): Promise<LessonRecord | null> {
    return this.db.run(system(clubId), async (tx) => {
      const row = await tx.lesson.findFirst({
        where: { id: lessonId, clubId },
        include: lessonInclude,
      });
      return row ? toRecord(tx, row) : null;
    });
  }

  async list(query: LessonQuery): Promise<LessonRecord[]> {
    const out: LessonRecord[] = [];
    for (const clubId of query.clubIds) {
      const rows = await this.db.run(system(clubId), async (tx) => {
        const lessons = await tx.lesson.findMany({
          where: {
            clubId,
            ...(query.as.role === 'coach'
              ? {
                  coachUserId: query.as.userId,
                  ...(query.studentId
                    ? { students: { some: { userId: query.studentId, accepted: true } } }
                    : {}),
                }
              : { students: { some: { userId: query.as.userId } } }),
            ...(query.after
              ? {
                  match: {
                    OR: [
                      { startsAt: { lt: query.after.startsAt } },
                      { startsAt: query.after.startsAt },
                    ],
                  },
                }
              : {}),
          },
          include: lessonInclude,
          orderBy: [{ match: { startsAt: 'desc' } }, { id: 'desc' }],
          take: query.limit + 1,
        });
        return Promise.all(lessons.map((l) => toRecord(tx, l)));
      });
      out.push(...rows);
    }
    return out;
  }

  async addNote(note: NewNote): Promise<NoteRecord> {
    const row = await this.db.run(system(note.clubId), (tx) =>
      tx.lessonNote.create({
        data: {
          id: note.id,
          clubId: note.clubId,
          lessonId: note.lessonId,
          studentUserId: note.studentUserId,
          text: note.text,
          atMs: note.atMs,
          drawing: (note.drawing ?? Prisma.DbNull) as Prisma.InputJsonValue,
          isPlan: note.isPlan,
          visibleToStudents: note.visibleToStudents,
        },
      }),
    );
    return { ...note, createdAt: row.createdAt };
  }

  async listStudents(clubIds: string[], coachUserId: string): Promise<CoachStudentRecord[]> {
    const byUser = new Map<string, CoachStudentRecord>();
    for (const clubId of clubIds) {
      await this.db.run(system(clubId), async (tx) => {
        const rows = await tx.lessonStudent.findMany({
          where: { clubId, accepted: true, lesson: { coachUserId } },
          include: {
            user: { select: { name: true } },
            lesson: { include: { match: { select: { startsAt: true } } } },
          },
        });
        const grants = await tx.coachAccessGrant.findMany({
          where: { clubId, coachUserId, revokedAt: null },
          select: { studentUserId: true },
        });
        const granted = new Set(grants.map((g) => g.studentUserId));
        const paid = await tx.payment.findMany({
          where: { clubId, concept: 'lesson', status: 'pending', lesson: { coachUserId } },
          select: { userId: true, amountCents: true },
        });
        for (const row of rows) {
          const current = byUser.get(row.userId) ?? {
            userId: row.userId,
            name: row.user.name,
            access: 'lessons_only' as CoachAccess,
            lessonsCount: 0,
            lastLessonAt: null,
            pendingPaymentCents: 0,
          };
          current.lessonsCount += 1;
          const at = row.lesson.match.startsAt;
          if (!current.lastLessonAt || at > current.lastLessonAt) current.lastLessonAt = at;
          if (granted.has(row.userId)) current.access = 'matches_and_lessons';
          byUser.set(row.userId, current);
        }
        for (const p of paid) {
          const current = p.userId ? byUser.get(p.userId) : undefined;
          if (current) current.pendingPaymentCents += p.amountCents;
        }
      });
    }
    return [...byUser.values()].sort((a, b) => a.userId.localeCompare(b.userId));
  }

  async accessLevel(
    clubId: string,
    coachUserId: string,
    studentUserId: string,
  ): Promise<CoachAccess> {
    const grant = await this.db.run(system(clubId), (tx) =>
      tx.coachAccessGrant.findFirst({
        where: { clubId, coachUserId, studentUserId, revokedAt: null },
        select: { id: true },
      }),
    );
    return grant ? 'matches_and_lessons' : 'lessons_only';
  }

  async setAccess(
    clubId: string,
    coachUserId: string,
    studentUserId: string,
    level: CoachAccess,
    now: Date,
  ): Promise<void> {
    // Only the student writes their own consent (RLS).
    await this.db.run({ role: 'player', userId: studentUserId }, async (tx) => {
      const where = { clubId_coachUserId_studentUserId: { clubId, coachUserId, studentUserId } };
      if (level === 'matches_and_lessons') {
        await tx.coachAccessGrant.upsert({
          where,
          create: { id: newId(), clubId, coachUserId, studentUserId, grantedAt: now },
          update: { grantedAt: now, revokedAt: null },
        });
      } else {
        await tx.coachAccessGrant.updateMany({
          where: { clubId, coachUserId, studentUserId, revokedAt: null },
          data: { revokedAt: now },
        });
      }
    });
  }

  async acceptInvite(
    clubId: string,
    lessonId: string,
    userId: string,
    now: Date,
  ): Promise<boolean> {
    const result = await this.db.run({ role: 'player', userId, clubId }, (tx) =>
      tx.lessonStudent.updateMany({
        where: { lessonId, userId },
        data: { accepted: true, acceptedAt: now },
      }),
    );
    return result.count > 0;
  }
}
