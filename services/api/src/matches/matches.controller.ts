import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AccessTokenGuard, Auth } from '../auth/access-token.guard';
import type { AccessIdentity } from '../auth/session/session.service';
import { parseInput } from '../common/zod';
import {
  MatchesService,
  type MatchDetailDto,
  type ScoreCorrectionDto,
  type ScoreCorrectionInput,
} from './matches.service';

const idSchema = z.uuid();
const team = z.union([z.literal(1), z.literal(2)]);
const setScore = z.object({ team_1: z.number().int().min(0), team_2: z.number().int().min(0) });
const claimBody = z
  .object({
    position: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  })
  .strict();
const correctionBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('final_score'), sets: z.array(setScore).min(1).max(3) }).strict(),
  z.object({ type: z.literal('point_winner'), point_id: z.uuid(), winner_team: team }).strict(),
]);

@Controller('matches')
@UseGuards(AccessTokenGuard)
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  @Get(':id')
  get(@Auth() auth: AccessIdentity, @Param('id') id: string): Promise<MatchDetailDto> {
    return this.matches.get(auth, parseInput(idSchema, id));
  }

  @Post(':id/claim-player')
  @HttpCode(200)
  claim(
    @Auth() auth: AccessIdentity,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MatchDetailDto> {
    return this.matches.claimPlayer(
      auth,
      parseInput(idSchema, id),
      parseInput(claimBody, body).position,
    );
  }

  @Post(':id/score-correction')
  @HttpCode(202)
  correct(
    @Auth() auth: AccessIdentity,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ScoreCorrectionDto> {
    return this.matches.correctScore(
      auth,
      parseInput(idSchema, id),
      parseInput(correctionBody, body) as ScoreCorrectionInput,
    );
  }
}
