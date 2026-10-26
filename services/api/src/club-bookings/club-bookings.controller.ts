import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AccessTokenGuard, Auth } from '../auth/access-token.guard';
import type { AccessIdentity } from '../auth/session/session.service';
import { parseInput } from '../common/zod';
import { ClubBookingsService, type ClubBookingPageDto } from './club-bookings.service';

const query = z.object({
  club_id: z.uuid(),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  court_id: z.uuid().optional(),
  status: z.enum(['held', 'confirmed', 'completed', 'cancelled', 'no_show', 'expired']).optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

@Controller('club-admin/bookings')
@UseGuards(AccessTokenGuard)
export class ClubBookingsController {
  constructor(private readonly bookings: ClubBookingsService) {}

  @Get()
  list(@Auth() auth: AccessIdentity, @Query() raw: unknown): Promise<ClubBookingPageDto> {
    const q = parseInput(query, raw);
    return this.bookings.list(auth, q.club_id, {
      from: new Date(q.from),
      to: new Date(q.to),
      courtId: q.court_id,
      status: q.status,
      cursor: q.cursor,
      limit: q.limit,
    });
  }
}
