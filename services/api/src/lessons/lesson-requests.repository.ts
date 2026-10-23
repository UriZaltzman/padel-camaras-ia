export type LessonRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface LessonRequestRecord {
  id: string;
  clubId: string;
  clubName: string;
  coach: { id: string; name: string };
  student: { id: string; name: string };
  courtId: string;
  courtName: string;
  startsAt: Date;
  durationMinutes: number;
  message: string | null;
  status: LessonRequestStatus;
  reason: string | null;
  lessonId: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

export interface NewLessonRequest {
  id: string;
  clubId: string;
  coachUserId: string;
  studentUserId: string;
  courtId: string;
  startsAt: Date;
  durationMinutes: number;
  message: string | null;
}

export interface LessonRequestQuery {
  as: { role: 'coach' | 'student'; userId: string };
  status?: LessonRequestStatus;
  /** Keyset: requests strictly before this `(createdAt, id)`. */
  after?: { createdAt: Date; id: string };
  limit: number;
}

export abstract class LessonRequestsRepository {
  /** Digits-only phone of the user, or null. Read as the club's system. */
  abstract phoneOf(clubId: string, userId: string): Promise<string | null>;
  abstract create(request: NewLessonRequest): Promise<LessonRequestRecord>;
  /** Visible to the coach and the student of the request (RLS). */
  abstract find(userId: string, id: string): Promise<LessonRequestRecord | null>;
  abstract list(query: LessonRequestQuery): Promise<LessonRequestRecord[]>;
  /**
   * Moves a `pending` request to `status`. Returns false when it was no longer pending, so two
   * concurrent decisions cannot both win.
   */
  abstract decide(
    clubId: string,
    id: string,
    status: Exclude<LessonRequestStatus, 'pending'>,
    fields: { lessonId?: string; reason?: string | null; now: Date },
  ): Promise<boolean>;
}
