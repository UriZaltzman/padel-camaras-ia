import { Inject, Injectable } from '@nestjs/common';
import type { AccessIdentity } from '../auth/session/session.service';
import { AvailabilityService } from '../bookings/availability.service';
import { SlotTakenError, BookingsRepository } from '../bookings/bookings.repository';
import { localDate } from '../bookings/slots';
import { ClubModulesService } from '../club-modules/club-modules.service';
import { MembershipsRepository } from '../clubs/memberships.repository';
import { CLOCK, type Clock } from '../common/clock';
import { newId } from '../db/ids';
import { AppError } from '../errors/app-error';
import { setLogContext } from '../logging/request-context';
import {
  LessonsRepository,
  UnknownStudentError,
  type CoachStudentRecord,
  type LessonKind,
  type LessonRecord,
  type NoteRecord,
} from './lessons.repository';

export interface LessonCreateInput {
  court_id: string;
  starts_at: string;
  duration_minutes: 60 | 90 | 120;
  kind: LessonKind;
  student_ids?: string[];
  price_cents?: number | null;
  record?: boolean;
  focus?: string | null;
}

export interface LessonNoteInput {
  text: string;
  at_ms?: number | null;
  student_id?: string | null;
  drawing?: { strokes: unknown[] } | null;
  is_plan?: boolean;
  visible_to_students?: boolean;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

const ADULT_YEARS = 18;

function isMinor(birthDate: Date | null | undefined, now: Date): boolean {
  if (!birthDate) return false;
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - ADULT_YEARS);
  return birthDate > cutoff;
}

export function toLessonDto(l: LessonRecord) {
  return {
    id: l.id,
    club: { id: l.clubId, name: l.clubName },
    court: { id: l.courtId, name: l.courtName },
    coach: l.coach,
    kind: l.kind,
    starts_at: l.startsAt.toISOString(),
    ends_at: l.endsAt.toISOString(),
    booking_id: l.bookingId,
    booking_status: l.bookingStatus,
    match_id: l.matchId,
    students: l.students.map((s) => ({
      user: { id: s.userId, name: s.name },
      accepted: s.accepted,
      payment_status: s.paymentStatus,
    })),
    price_cents: l.priceCents,
    no_record: l.noRecord,
    no_record_reason: l.noRecordReason,
    focus: l.focus,
    notes_count: l.notesCount,
  };
}
export type LessonDto = ReturnType<typeof toLessonDto>;

function encodeCursor(l: LessonRecord): string {
  return Buffer.from(JSON.stringify({ s: l.startsAt.toISOString(), i: l.id })).toString(
    'base64url',
  );
}

function decodeCursor(cursor: string | undefined): { startsAt: Date; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      s?: unknown;
      i?: unknown;
    };
    const startsAt = new Date(String(parsed.s));
    if (typeof parsed.i !== 'string' || Number.isNaN(startsAt.getTime())) throw new Error();
    return { startsAt, id: parsed.i };
  } catch {
    throw new AppError('VALIDATION_FAILED', { issues: [{ path: '/cursor', rule: 'invalid' }] });
  }
}

@Injectable()
export class LessonsService {
  constructor(
    private readonly repo: LessonsRepository,
    private readonly bookings: BookingsRepository,
    private readonly availability: AvailabilityService,
    private readonly modules: ClubModulesService,
    private readonly memberships: MembershipsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** A coach of the club books the court; same slot rules and exclusion constraint as bookings. */
  async create(auth: AccessIdentity, input: LessonCreateInput): Promise<LessonDto> {
    const court = await this.bookings.findCourt(input.court_id);
    if (!court) throw new AppError('NOT_FOUND');
    setLogContext({ club_id: court.clubId });
    const roles = await this.memberships.activeRoles(auth.userId, court.clubId);
    if (!roles.includes('coach')) throw new AppError('FORBIDDEN');
    await this.modules.assertEnabled(court.clubId, 'lessons_in_app');
    if (court.status !== 'active') throw new AppError('BOOKING_SLOT_INVALID');

    const studentIds = input.student_ids ?? [];
    if (studentIds.includes(auth.userId)) {
      throw new AppError('VALIDATION_FAILED', {
        issues: [{ path: '/student_ids', rule: 'coach_is_student' }],
      });
    }

    const startsAt = new Date(input.starts_at);
    const date = localDate(startsAt, court.timezone);
    await this.bookings.expireHolds(court.clubId, this.clock.now());
    const slots = await this.availability.slotsFor(court, date, input.duration_minutes);
    const slot = slots.find((s) => s.start.getTime() === startsAt.getTime());
    if (!slot) {
      const rulesOnly = await this.availability.slotsFor(court, date, input.duration_minutes, {
        ignoreOccupancy: true,
      });
      if (rulesOnly.some((s) => s.start.getTime() === startsAt.getTime())) throw this.taken(input);
      throw new AppError('BOOKING_SLOT_INVALID');
    }

    const { noRecord, includesMinors } = await this.recordingDecision(
      court.clubId,
      input,
      studentIds,
    );
    try {
      const lesson = await this.repo.create({
        id: newId(),
        bookingId: newId(),
        matchId: newId(),
        clubId: court.clubId,
        courtId: court.courtId,
        coachUserId: auth.userId,
        startsAt: slot.start,
        endsAt: slot.end,
        bookingPriceCents: slot.amountCents,
        kind: input.kind,
        studentIds,
        priceCents: input.price_cents ?? null,
        noRecord,
        includesMinors,
        focus: input.focus ?? null,
      });
      return toLessonDto(lesson);
    } catch (error) {
      if (error instanceof SlotTakenError) throw this.taken(input);
      if (error instanceof UnknownStudentError) {
        throw new AppError('VALIDATION_FAILED', {
          issues: [{ path: '/student_ids', rule: 'unknown_user' }],
        });
      }
      throw error;
    } finally {
      this.availability.invalidate(court.courtId);
    }
  }

  /**
   * Schools are "do not record" unless the coach asks otherwise; a minor is never recorded
   * here because this endpoint carries no guardian permission (spec §12).
   */
  private async recordingDecision(
    clubId: string,
    input: LessonCreateInput,
    studentIds: string[],
  ): Promise<{ noRecord: boolean; includesMinors: boolean }> {
    const births =
      studentIds.length > 0 ? await this.repo.birthDates(clubId, studentIds) : new Map();
    const now = this.clock.now();
    const includesMinors = [...births.values()].some((b) => isMinor(b, now));
    const wantsRecording = input.record ?? input.kind !== 'school';
    return { noRecord: !wantsRecording || includesMinors, includesMinors };
  }

  private taken(input: LessonCreateInput): AppError {
    return new AppError('BOOKING_SLOT_TAKEN', {
      court_id: input.court_id,
      starts_at: new Date(input.starts_at).toISOString(),
    });
  }

  async list(
    auth: AccessIdentity,
    query: { role?: 'coach' | 'student'; student_id?: string; cursor?: string; limit: number },
  ): Promise<Page<LessonDto>> {
    const coachClubs = await this.repo.coachClubIds(auth.userId);
    const role = query.role ?? (coachClubs.length > 0 ? 'coach' : 'student');
    if (role === 'student' && query.student_id) {
      throw new AppError('VALIDATION_FAILED', {
        issues: [{ path: '/student_id', rule: 'coach_only' }],
      });
    }
    const clubIds = role === 'coach' ? coachClubs : await this.repo.studentClubIds(auth.userId);
    const after = decodeCursor(query.cursor);
    const rows = await this.repo.list({
      clubIds,
      as: { role, userId: auth.userId },
      studentId: query.student_id,
      after,
      limit: query.limit,
    });
    const ordered = rows
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime() || b.id.localeCompare(a.id))
      .filter(
        (l) =>
          !after ||
          l.startsAt < after.startsAt ||
          (l.startsAt.getTime() === after.startsAt.getTime() && l.id < after.id),
      );
    const items = ordered.slice(0, query.limit);
    const last = items[items.length - 1];
    return {
      items: items.map(toLessonDto),
      next_cursor: ordered.length > query.limit && last ? encodeCursor(last) : null,
    };
  }

  /** Only the lesson's own coach writes notes. */
  async addNote(auth: AccessIdentity, lessonId: string, input: LessonNoteInput) {
    const lesson = await this.findCoachLesson(auth.userId, lessonId);
    setLogContext({ club_id: lesson.clubId });
    await this.modules.assertEnabled(lesson.clubId, 'lessons_in_app');
    if ((input.drawing && input.at_ms === null) || input.at_ms === undefined) {
      throw new AppError('VALIDATION_FAILED', {
        issues: [{ path: '/drawing', rule: 'needs_at_ms' }],
      });
    }
    if (input.student_id && !lesson.students.some((s) => s.userId === input.student_id)) {
      throw new AppError('VALIDATION_FAILED', {
        issues: [{ path: '/student_id', rule: 'not_in_lesson' }],
      });
    }
    const note = await this.repo.addNote({
      id: newId(),
      clubId: lesson.clubId,
      lessonId,
      studentUserId: input.student_id ?? null,
      text: input.text,
      atMs: input.at_ms ?? null,
      drawing: input.drawing ?? null,
      isPlan: input.is_plan ?? false,
      visibleToStudents: input.visible_to_students ?? true,
    });
    return toNoteDto(note);
  }

  private async findCoachLesson(userId: string, lessonId: string): Promise<LessonRecord> {
    const clubs = await this.repo.coachClubIds(userId);
    for (const clubId of clubs) {
      const lesson = await this.repo.find(clubId, lessonId);
      if (lesson) {
        if (lesson.coach.id !== userId) throw new AppError('FORBIDDEN');
        return lesson;
      }
    }
    throw new AppError('NOT_FOUND');
  }

  async students(
    auth: AccessIdentity,
    query: { cursor?: string; limit: number },
  ): Promise<Page<ReturnType<typeof toStudentDto>>> {
    const clubs = await this.repo.coachClubIds(auth.userId);
    if (clubs.length === 0) throw new AppError('FORBIDDEN');
    const all = await this.repo.listStudents(clubs, auth.userId);
    const start = query.cursor ? all.findIndex((s) => s.userId === query.cursor) + 1 : 0;
    const items = all.slice(start, start + query.limit);
    const last = items[items.length - 1];
    return {
      items: items.map(toStudentDto),
      next_cursor: start + query.limit < all.length && last ? last.userId : null,
    };
  }
}

function toNoteDto(n: NoteRecord) {
  return {
    id: n.id,
    lesson_id: n.lessonId,
    text: n.text,
    at_ms: n.atMs,
    student_id: n.studentUserId,
    drawing: n.drawing ?? null,
    is_plan: n.isPlan,
    visible_to_students: n.visibleToStudents,
    created_at: n.createdAt.toISOString(),
  };
}

function toStudentDto(s: CoachStudentRecord) {
  return {
    user: { id: s.userId, name: s.name },
    access: s.access,
    lessons_count: s.lessonsCount,
    last_lesson_at: s.lastLessonAt?.toISOString() ?? null,
    pending_payment_cents: s.pendingPaymentCents,
  };
}
