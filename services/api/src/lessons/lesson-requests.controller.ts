import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AccessTokenGuard, Auth } from '../auth/access-token.guard';
import type { AccessIdentity } from '../auth/session/session.service';
import { parseInput } from '../common/zod';
import { LessonRequestsService } from './lesson-requests.service';

const createBody = z
  .object({
    club_id: z.uuid(),
    coach_id: z.uuid(),
    court_id: z.uuid().optional(),
    starts_at: z.iso.datetime().optional(),
    duration_minutes: z.union([z.literal(60), z.literal(90), z.literal(120)]).optional(),
    message: z.string().min(1).max(500).optional(),
  })
  .strict();
const listQuery = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    role: z.enum(['coach', 'student']).optional(),
    status: z.enum(['pending', 'accepted', 'rejected', 'cancelled']).optional(),
  })
  .strict();
const decisionBody = z.object({ reason: z.string().min(1).max(500).optional() }).strict();
const idSchema = z.uuid();

@Controller('lessons/requests')
@UseGuards(AccessTokenGuard)
export class LessonRequestsController {
  constructor(private readonly requests: LessonRequestsService) {}

  @Get()
  list(@Auth() auth: AccessIdentity, @Query() query: unknown) {
    return this.requests.list(auth, parseInput(listQuery, query));
  }

  @Post()
  @HttpCode(201)
  create(@Auth() auth: AccessIdentity, @Body() body: unknown) {
    return this.requests.create(auth, parseInput(createBody, body));
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(@Auth() auth: AccessIdentity, @Param('id') id: string) {
    return this.requests.accept(auth, parseInput(idSchema, id));
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@Auth() auth: AccessIdentity, @Param('id') id: string, @Body() body: unknown) {
    return this.requests.reject(
      auth,
      parseInput(idSchema, id),
      parseInput(decisionBody, body ?? {}).reason,
    );
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Auth() auth: AccessIdentity, @Param('id') id: string) {
    return this.requests.cancel(auth, parseInput(idSchema, id));
  }
}
