import { Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock';
import { AppError } from '../errors/app-error';
import { LessonsRepository, type CoachAccess } from './lessons.repository';
import { Inject } from '@nestjs/common';

/**
 * Student consent for coaches (spec §12). A coach only sees a student's matches and stats when
 * the student chose `matches_and_lessons`; otherwise only the lessons the coach taught.
 */
@Injectable()
export class CoachAccessService {
  constructor(
    private readonly repo: LessonsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  level(clubId: string, coachUserId: string, studentUserId: string): Promise<CoachAccess> {
    return this.repo.accessLevel(clubId, coachUserId, studentUserId);
  }

  /** Throws `COACH_ACCESS_NOT_GRANTED` (403) unless the student shared their matches. */
  async assertCanViewMatchesOf(
    clubId: string,
    coachUserId: string,
    studentUserId: string,
  ): Promise<void> {
    if (coachUserId === studentUserId) return;
    if ((await this.level(clubId, coachUserId, studentUserId)) !== 'matches_and_lessons') {
      throw new AppError('COACH_ACCESS_NOT_GRANTED');
    }
  }

  /** The student decides, for one coach in one club. Revoking takes effect at once. */
  setAccess(
    studentUserId: string,
    clubId: string,
    coachUserId: string,
    level: CoachAccess,
  ): Promise<void> {
    return this.repo.setAccess(clubId, coachUserId, studentUserId, level, this.clock.now());
  }
}
