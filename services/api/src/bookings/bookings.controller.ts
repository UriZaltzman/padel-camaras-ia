import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseInput } from '../common/zod';
import { AvailabilityService, type CourtAvailabilityDto } from './availability.service';

const idSchema = z.uuid();
const duration = z.union([z.literal(60), z.literal(90), z.literal(120)]);
const availabilityQuery = z.object({
  date: z.iso.date(),
  duration_minutes: z.coerce.number().pipe(duration),
});

@Controller()
export class BookingsController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get('courts/:id/availability')
  getAvailability(@Param('id') id: string, @Query() query: unknown): Promise<CourtAvailabilityDto> {
    const q = parseInput(availabilityQuery, query);
    return this.availability.forCourt(parseInput(idSchema, id), q.date, q.duration_minutes);
  }
}
