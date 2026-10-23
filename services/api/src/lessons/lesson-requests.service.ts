import { Inject, Injectable } from '@nestjs/common';
import type { AccessIdentity } from '../auth/session/session.service';
import { AvailabilityService } from '../bookings/availability.service';
import { BookingsRepository } from '../bookings/bookings.repository';
import { localDate } from '../bookings/slots';
import { ClubModulesService } from '../club-modules/club-modules.service';
import { MembershipsRepository } from '../clubs/memberships.repository';
import { CLOCK, type Clock } from '../common/clock';
import { newId } from '../db/ids';
import { AppError } from '../errors/app-error';
import { setLogContext } from '../logging/request-context';
import {
  LessonRequestsRepository,
  type LessonRequestRecord,
  type LessonRequestStatus,
} from './lesson-requests.repository';
import { LessonsRepository } from './lessons.repository';
import { LessonsService, type Page } from './lessons.service';

export interface LessonRequestCreateInput {
  club_id: string;
  coach_id: string;
  court_id?: string;
  starts_at?: string;
  duration_minutes?: 60 | 90 | 120;
  message?: string;
}

export function toLessonRequestDto(r: LessonRequestRecord) {
  return {
    id: r.id,
    club: { id: r.clubId, name: r.clubName },
    coach: r.coach,
    student: r.student,
    court: { id: r.courtId, name: r.courtName },
    starts_at: r.startsAt.toISOString(),
    ends_at: new Date(r.startsAt.getTime() + r.durationMinutes * 60_000).toISOString(),
    duration_minutes: r.durationMinutes,
    message: r.message,
    status: r.status,
    reason: r.reason,
    lesson_id: r.lessonId,
    created_at: r.createdAt.toISOString(),
    decided_at: r.decidedAt?.toISOString() ?? null,
  };
}
export type LessonRequestDto = ReturnType<typeof toLessonRequestDto>;

const encodeCursor = (r: LessonRequestRecord): string =>
  Buffer.from(JSON.stringify({ c: r.createdAt.toISOString(), i: r.id })).toString('base64url');

function decodeCursor(cursor: string | undefined): { createdAt: Date; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      c?: unknown;
      i?: unknown;
    };
    const createdAt = new Date(String(parsed.c));
    if (typeof parsed.i !== 'string' || Number.isNaN(createdAt.getTime())) throw new Error();
    return { createdAt, id: parsed.i };
  } catch {
    throw new AppError('VALIDATION_FAILED', { issues: [{ path: '/cursor', rule: 'invalid' }] });
  }
}

const invalid = (path: string, rule: string) =>
  new AppError('VALIDATION_FAILED', { issues: [{ path, rule }] });

/**
 * Lesson requests (CL-07, JG-06). The club's `lesson_mode` decides: `app` stores a request the
 * coach accepts (which books the court as a lesson) or rejects; `whatsapp` only returns the
 * coach's wa.me link and books nothing.
 */
@Injectable()
export class LessonRequestsService {
  constructor(
    private readonly repo: LessonRequestsRepository,
    private readonly lessonsRepo: LessonsRepository,
    private readonly lessons: LessonsService,
    private readonly bookings: BookingsRepository,
    private readonly availability: AvailabilityService,
    private readonly modules: ClubModulesService,
    private readonly memberships: MembershipsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(auth: AccessIdentity, input: LessonRequestCreateInput) {
    setLogContext({ club_id: input.club_id });
    if (input.coach_id === auth.userId) throw invalid('/coach_id', 'coach_is_student');
    const coachRoles = await this.memberships.activeRoles(input.coach_id, input.club_id);
    if (!coachRoles.includes('coach')) throw new AppError('NOT_FOUND');

    const { lesson_mode: mode } = await this.modules.get(input.club_id);
    if (mode === 'whatsapp') {
      const phone = await this.repo.phoneOf(input.club_id, input.coach_id);
      if (!phone) throw invalid('/coach_id', 'coach_without_phone');
      const text = input.message ? `?text=${encodeURIComponent(input.message)}` : '';
      return { mode, request: null, whatsapp_url: `https://wa.me/${phone}${text}` };
    }

    if (!input.court_id) throw invalid('/court_id', 'required');
    if (!input.starts_at) throw invalid('/starts_at', 'required');
    if (!input.duration_minutes) throw invalid('/duration_minutes', 'required');
    const court = await this.bookings.findCourt(input.court_id);
    if (!court || court.clubId !== input.club_id) throw new AppError('NOT_FOUND');
    if (court.status !== 'active') throw new AppError('BOOKING_SLOT_INVALID');
    const startsAt = new Date(input.starts_at);
    await this.assertSlotFree(court, startsAt, input.duration_minutes);

    const record = await this.repo.create({
      id: newId(),
      clubId: input.club_id,
      coachUserId: input.coach_id,
      studentUserId: auth.userId,
      courtId: court.courtId,
      startsAt,
      durationMinutes: input.duration_minutes,
      message: input.message ?? null,
    });
    return { mode, request: toLessonRequestDto(record), whatsapp_url: null };
  }

  private async assertSlotFree(
    court: NonNullable<Awaited<ReturnType<BookingsRepository['findCourt']>>>,
    startsAt: Date,
    duration: 60 | 90 | 120,
  ): Promise<void> {
    await this.bookings.expireHolds(court.clubId, this.clock.now());
    const date = localDate(startsAt, court.timezone);
    const slots = await this.availability.slotsFor(court, date, duration);
    if (slots.some((s) => s.start.getTime() === startsAt.getTime())) return;
    const rulesOnly = await this.availability.slotsFor(court, date, duration, {
      ignoreOccupancy: true,
    });
    if (rulesOnly.some((s) => s.start.getTime() === startsAt.getTime())) {
      throw new AppError('BOOKING_SLOT_TAKEN', {
        court_id: court.courtId,
        starts_at: startsAt.toISOString(),
      });
    }
    throw new AppError('BOOKING_SLOT_INVALID');
  }

  async list(
    auth: AccessIdentity,
    query: {
      role?: 'coach' | 'student';
      status?: LessonRequestStatus;
      cursor?: string;
      limit: number;
    },
  ): Promise<Page<LessonRequestDto>> {
    const role =
      query.role ??
      ((await this.lessonsRepo.coachClubIds(auth.userId)).length > 0 ? 'coach' : 'student');
    const rows = await this.repo.list({
      as: { role, userId: auth.userId },
      status: query.status,
      after: decodeCursor(query.cursor),
      limit: query.limit,
    });
    const items = rows.slice(0, query.limit);
    const last = items[items.length - 1];
    return {
      items: items.map(toLessonRequestDto),
      next_cursor: rows.length > query.limit && last ? encodeCursor(last) : null,
    };
  }

  /** Books the court as a lesson (same rules and exclusion constraint as `POST /lessons`). */
  async accept(auth: AccessIdentity, id: string): Promise<LessonRequestDto> {
    const request = await this.findPending(auth.userId, id, 'coach');
    setLogContext({ club_id: request.clubId });
    await this.modules.assertEnabled(request.clubId, 'lessons_in_app');
    const lesson = await this.lessons.create(auth, {
      court_id: request.courtId,
      starts_at: request.startsAt.toISOString(),
      duration_minutes: request.durationMinutes as 60 | 90 | 120,
      kind: 'private',
      student_ids: [request.student.id],
      focus: request.message?.slice(0, 200) ?? null,
    });
    const now = this.clock.now();
    const decided = await this.repo.decide(request.clubId, id, 'accepted', {
      lessonId: lesson.id,
      now,
    });
    if (!decided) throw new AppError('INVALID_STATE_TRANSITION', { reason: 'not_pending' });
    // The student asked for it: the invitation is accepted from the start.
    await this.lessonsRepo.acceptInvite(request.clubId, lesson.id, request.student.id, now);
    return this.reload(auth.userId, id);
  }

  async reject(auth: AccessIdentity, id: string, reason: string | undefined) {
    const request = await this.findPending(auth.userId, id, 'coach');
    return this.close(auth.userId, request, 'rejected', reason ?? null);
  }

  async cancel(auth: AccessIdentity, id: string) {
    const request = await this.findPending(auth.userId, id, 'student');
    return this.close(auth.userId, request, 'cancelled', null);
  }

  private async close(
    userId: string,
    request: LessonRequestRecord,
    status: 'rejected' | 'cancelled',
    reason: string | null,
  ): Promise<LessonRequestDto> {
    setLogContext({ club_id: request.clubId });
    const decided = await this.repo.decide(request.clubId, request.id, status, {
      reason,
      now: this.clock.now(),
    });
    if (!decided) throw new AppError('INVALID_STATE_TRANSITION', { reason: 'not_pending' });
    return this.reload(userId, request.id);
  }

  private async reload(userId: string, id: string): Promise<LessonRequestDto> {
    const record = await this.repo.find(userId, id);
    if (!record) throw new AppError('NOT_FOUND');
    return toLessonRequestDto(record);
  }

  /** NOT_FOUND for strangers (RLS hides it), FORBIDDEN for the wrong side of the request. */
  private async findPending(
    userId: string,
    id: string,
    side: 'coach' | 'student',
  ): Promise<LessonRequestRecord> {
    const request = await this.repo.find(userId, id);
    if (!request) throw new AppError('NOT_FOUND');
    const owner = side === 'coach' ? request.coach.id : request.student.id;
    if (owner !== userId) throw new AppError('FORBIDDEN');
    if (request.status !== 'pending') {
      throw new AppError('INVALID_STATE_TRANSITION', { reason: 'not_pending' });
    }
    return request;
  }
}
