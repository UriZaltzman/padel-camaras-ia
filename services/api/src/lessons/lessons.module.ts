import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsModule } from '../bookings/bookings.module';
import { ClubsModule } from '../clubs/clubs.module';
import { CoachAccessService } from './coach-access.service';
import { LessonRequestsController } from './lesson-requests.controller';
import { LessonRequestsRepository } from './lesson-requests.repository';
import { LessonRequestsService } from './lesson-requests.service';
import { LessonsController } from './lessons.controller';
import { LessonsRepository } from './lessons.repository';
import { LessonsService } from './lessons.service';
import { PrismaLessonRequestsRepository } from './prisma-lesson-requests.repository';
import { PrismaLessonsRepository } from './prisma-lessons.repository';

@Module({
  imports: [AuthModule, BookingsModule, ClubsModule],
  controllers: [LessonRequestsController, LessonsController],
  providers: [
    LessonsService,
    LessonRequestsService,
    { provide: LessonRequestsRepository, useClass: PrismaLessonRequestsRepository },
    CoachAccessService,
    { provide: LessonsRepository, useClass: PrismaLessonsRepository },
  ],
  exports: [CoachAccessService],
})
export class LessonsModule {}
