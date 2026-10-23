import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AccessTokenGuard, Auth } from '../auth/access-token.guard';
import type { AccessIdentity } from '../auth/session/session.service';
import { parseInput } from '../common/zod';
import { AvailabilityService, type CourtAvailabilityDto } from './availability.service';
import { CancellationService, type BookingCancellationDto } from './cancellation.service';
import { BookingsService, type BookingDto } from './bookings.service';

const idSchema = z.uuid();
const duration = z.union([z.literal(60), z.literal(90), z.literal(120)]);
const availabilityQuery = z.object({
  date: z.iso.date(),
  duration_minutes: z.coerce.number().pipe(duration),
});
const createBody = z
  .object({
    court_id: z.uuid(),
    starts_at: z.iso.datetime(),
    duration_minutes: duration,
    // Weekly series and guardian consent arrive with their own issues.
    no_record: z.boolean().optional(),
  })
  .strict();
const cancelBody = z
  .object({ scope: z.enum(['this', 'series']).optional() })
  .strict()
  .optional();
const idempotencyKey = z.string().min(8).max(128).optional();

@Controller()
export class BookingsController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly bookings: BookingsService,
    private readonly cancellation: CancellationService,
  ) {}

  @Get('courts/:id/availability')
  getAvailability(@Param('id') id: string, @Query() query: unknown): Promise<CourtAvailabilityDto> {
    const q = parseInput(availabilityQuery, query);
    return this.availability.forCourt(parseInput(idSchema, id), q.date, q.duration_minutes);
  }

  @Post('bookings')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  create(
    @Auth() auth: AccessIdentity,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<BookingDto> {
    return this.bookings.create(
      auth,
      parseInput(createBody, body),
      parseInput(idempotencyKey, key),
    );
  }

  /** `scope: series` is accepted; weekly series do not exist yet, so only this booking is cancelled. */
  @Post('bookings/:id/cancel')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  cancel(
    @Auth() auth: AccessIdentity,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<BookingCancellationDto> {
    parseInput(cancelBody, body && Object.keys(body as object).length ? body : undefined);
    return this.cancellation.cancel(auth, parseInput(idSchema, id));
  }
}
