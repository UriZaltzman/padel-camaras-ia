import { Body, Controller, Get, HttpCode, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AccessTokenGuard, Auth } from '../auth/access-token.guard';
import type { AccessIdentity } from '../auth/session/session.service';
import { parseInput } from '../common/zod';
import type { ClubDto } from './club-model';
import { ClubsService, type ClubSummaryPage } from './clubs.service';

const idSchema = z.uuid();
const listQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().min(2).max(80).optional(),
});

@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubs: ClubsService) {}

  @Get()
  list(@Query() query: unknown): Promise<ClubSummaryPage> {
    return this.clubs.list(parseInput(listQuerySchema, query));
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<ClubDto> {
    return this.clubs.get(parseInput(idSchema, id));
  }

  @Patch(':id/settings')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  updateSettings(
    @Auth() auth: AccessIdentity,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ClubDto> {
    return this.clubs.updateSettings(auth, parseInput(idSchema, id), body);
  }
}
