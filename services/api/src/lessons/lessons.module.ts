import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsModule } from '../bookings/bookings.module';
import { ClubsModule } from '../clubs/clubs.module';
import { CoachAccessService } from './coach-access.service';
import { LessonsController } from './lessons.controller';
import { LessonsRepository } from './lessons.repository';
import { LessonsService } from './lessons.service';
import { PrismaLessonsRepository } from './prisma-lessons.repository';

@Module({
  imports: [AuthModule, BookingsModule, ClubsModule],
  controllers: [LessonsController],
  providers: [
    LessonsService,
    CoachAccessService,
    { provide: LessonsRepository, useClass: PrismaLessonsRepository },
  ],
  exports: [CoachAccessService],
})
export class LessonsModule {}
