import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AccessTokenGuard, Auth } from '../auth/access-token.guard';
import type { AccessIdentity } from '../auth/session/session.service';
import { parseInput } from '../common/zod';
import type { Category } from '../ratings/rating-config';
import { RankingService, type ClubRankingDto } from './ranking.service';

const idSchema = z.uuid();
const querySchema = z.object({
  category: z.enum(['1', '2', '3', '4', '5', '6', '7', '8']),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

@Controller('clubs')
@UseGuards(AccessTokenGuard)
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  @Get(':id/ranking')
  get(
    @Auth() auth: AccessIdentity,
    @Param('id') id: string,
    @Query() query: unknown,
  ): Promise<ClubRankingDto> {
    const q = parseInput(querySchema, query);
    return this.ranking.get(
      auth,
      parseInput(idSchema, id),
      `cat_${q.category}` as Category,
      q.limit,
    );
  }
}
