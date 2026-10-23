export type LessonKind = 'private' | 'group' | 'school';
export type NoRecordReason = 'requested' | 'club_school' | 'minor_without_guardian';
export type CoachAccess = 'lessons_only' | 'matches_and_lessons';

export interface LessonRecord {
  id: string;
  clubId: string;
  clubName: string;
  courtId: string;
  courtName: string;
  coach: { id: string; name: string };
  kind: LessonKind;
  startsAt: Date;
  endsAt: Date;
  bookingId: string;
  bookingStatus: string;
  matchId: string | null;
  students: {
    userId: string;
    name: string;
    accepted: boolean;
    paymentStatus: string | null;
  }[];
  priceCents: number | null;
  noRecord: boolean;
  noRecordReason: NoRecordReason | null;
  focus: string | null;
  notesCount: number;
}

export interface NewLesson {
  id: string;
  bookingId: string;
  matchId: string;
  clubId: string;
  courtId: string;
  coachUserId: string;
  startsAt: Date;
  endsAt: Date;
  bookingPriceCents: number;
  kind: LessonKind;
  studentIds: string[];
  priceCents: number | null;
  noRecord: boolean;
  includesMinors: boolean;
  focus: string | null;
}

export interface NewNote {
  id: string;
  clubId: string;
  lessonId: string;
  studentUserId: string | null;
  text: string;
  atMs: number | null;
  drawing: unknown;
  isPlan: boolean;
  visibleToStudents: boolean;
}

export interface NoteRecord extends NewNote {
  createdAt: Date;
}

export interface CoachStudentRecord {
  userId: string;
  name: string;
  access: CoachAccess;
  lessonsCount: number;
  lastLessonAt: Date | null;
  pendingPaymentCents: number;
}

export interface LessonQuery {
  clubIds: string[];
  /** Coach: lessons they teach. Student: lessons they take. */
  as: { role: 'coach' | 'student'; userId: string };
  studentId?: string;
  /** Keyset: lessons strictly before this `(startsAt, id)`. */
  after?: { startsAt: Date; id: string };
  limit: number;
}

/** Thrown when a listed student does not exist. */
export class UnknownStudentError extends Error {}

export abstract class LessonsRepository {
  /** Club ids where the user holds an active coach membership. */
  abstract coachClubIds(userId: string): Promise<string[]>;
  /** Club ids of the lessons where the user is a student. */
  abstract studentClubIds(userId: string): Promise<string[]>;
  /** Birth dates of the users (null when unknown); a missing user is absent from the map. */
  abstract birthDates(clubId: string, userIds: string[]): Promise<Map<string, Date | null>>;
  /**
   * Booking (confirmed), `lesson` match and lesson in one transaction. Throws `SlotTakenError`
   * when the exclusion constraint rejects the booking, `UnknownStudentError` on a bad student.
   */
  abstract create(lesson: NewLesson): Promise<LessonRecord>;
  abstract find(clubId: string, lessonId: string): Promise<LessonRecord | null>;
  abstract list(query: LessonQuery): Promise<LessonRecord[]>;
  abstract addNote(note: NewNote): Promise<NoteRecord>;
  abstract listStudents(clubIds: string[], coachUserId: string): Promise<CoachStudentRecord[]>;
  abstract accessLevel(
    clubId: string,
    coachUserId: string,
    studentUserId: string,
  ): Promise<CoachAccess>;
  abstract setAccess(
    clubId: string,
    coachUserId: string,
    studentUserId: string,
    level: CoachAccess,
    now: Date,
  ): Promise<void>;
  /** Marks the invitation accepted. Returns false when the user was not invited. */
  abstract acceptInvite(
    clubId: string,
    lessonId: string,
    userId: string,
    now: Date,
  ): Promise<boolean>;
}
