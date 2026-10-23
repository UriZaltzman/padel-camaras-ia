import { Body, Controller, Get, HttpCode, Param, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AccessTokenGuard, Auth } from '../auth/access-token.guard';
import type { AccessIdentity } from '../auth/session/session.service';
import { parseInput } from '../common/zod';
import { CrmService, type ClubPlayerDetailDto, type ClubPlayerPageDto } from './crm.service';

const clubQuery = z.object({ club_id: z.uuid() });
const listQuery = clubQuery.extend({
  q: z.string().min(1).max(100).optional(),
  segment: z.enum(['frequent', 'dormant', 'no_show']).optional(),
  tag: z.string().min(1).max(30).optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const notesBody = z
  .object({
    tags: z.array(z.string().min(1).max(30)).max(10),
    notes: z.string().max(1000).nullable(),
  })
  .strict();

@Controller('club-admin/players')
@UseGuards(AccessTokenGuard)
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get()
  list(@Auth() auth: AccessIdentity, @Query() query: unknown): Promise<ClubPlayerPageDto> {
    const { club_id, ...q } = parseInput(listQuery, query);
    return this.crm.list(auth, club_id, q);
  }

  @Get(':userId')
  get(
    @Auth() auth: AccessIdentity,
    @Param('userId') userId: string,
    @Query() query: unknown,
  ): Promise<ClubPlayerDetailDto> {
    return this.crm.get(auth, parseInput(clubQuery, query).club_id, parseInput(z.uuid(), userId));
  }

  @Put(':userId/notes')
  @HttpCode(200)
  updateNotes(
    @Auth() auth: AccessIdentity,
    @Param('userId') userId: string,
    @Query() query: unknown,
    @Body() body: unknown,
  ): Promise<ClubPlayerDetailDto> {
    return this.crm.updateNotes(
      auth,
      parseInput(clubQuery, query).club_id,
      parseInput(z.uuid(), userId),
      parseInput(notesBody, body),
    );
  }
}
