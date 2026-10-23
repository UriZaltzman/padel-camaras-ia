import { Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { BookingsController } from './bookings.controller';
import { BookingsRepository } from './bookings.repository';
import { PrismaBookingsRepository } from './prisma-bookings.repository';

@Module({
  controllers: [BookingsController],
  providers: [
    AvailabilityService,
    { provide: BookingsRepository, useClass: PrismaBookingsRepository },
  ],
  exports: [AvailabilityService],
})
export class BookingsModule {}
