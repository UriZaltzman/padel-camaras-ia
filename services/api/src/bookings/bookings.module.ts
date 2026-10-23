import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AuthModule } from '../auth/auth.module';
import { REDIS } from '../redis/redis.module';
import { AvailabilityService } from './availability.service';
import { BOOKING_IDEMPOTENCY, RedisBookingIdempotency } from './booking-idempotency';
import { BookingsController } from './bookings.controller';
import { BookingsRepository } from './bookings.repository';
import { BookingsService } from './bookings.service';
import { HoldExpiryService } from './hold-expiry.service';
import { PrismaBookingsRepository } from './prisma-bookings.repository';

@Module({
  imports: [AuthModule],
  controllers: [BookingsController],
  providers: [
    AvailabilityService,
    BookingsService,
    HoldExpiryService,
    { provide: BookingsRepository, useClass: PrismaBookingsRepository },
    {
      provide: BOOKING_IDEMPOTENCY,
      inject: [REDIS],
      useFactory: (r: Redis) => new RedisBookingIdempotency(r),
    },
  ],
  exports: [AvailabilityService, BookingsService],
})
export class BookingsModule {}
