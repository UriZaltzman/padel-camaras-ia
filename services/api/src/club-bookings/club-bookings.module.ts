import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClubsModule } from '../clubs/clubs.module';
import { ClubBookingsController } from './club-bookings.controller';
import { ClubBookingsRepository } from './club-bookings.repository';
import { ClubBookingsService } from './club-bookings.service';
import { PrismaClubBookingsRepository } from './prisma-club-bookings.repository';

@Module({
  imports: [AuthModule, ClubsModule],
  controllers: [ClubBookingsController],
  providers: [
    ClubBookingsService,
    { provide: ClubBookingsRepository, useClass: PrismaClubBookingsRepository },
  ],
})
export class ClubBookingsModule {}
