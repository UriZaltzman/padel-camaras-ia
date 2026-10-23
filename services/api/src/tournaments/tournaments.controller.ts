import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AccessTokenGuard, Auth } from '../auth/access-token.guard';
import type { AccessIdentity } from '../auth/session/session.service';
import { RequiresModule } from '../club-modules/requires-module.guard';
import { parseInput } from '../common/zod';
import {
  TournamentsService,
  type PairDto,
  type TournamentDetailDto,
  type TournamentDto,
  type TournamentRankingDto,
} from './tournaments.service';

const uuid = z.uuid();

@Controller('clubs/:id')
// Decorators apply bottom-up: the token guard must run before the module guard.
@RequiresModule('tournaments')
@UseGuards(AccessTokenGuard)
export class TournamentsController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Get('tournaments')
  list(@Auth() auth: AccessIdentity, @Param('id') id: string): Promise<{ items: TournamentDto[] }> {
    return this.tournaments.list(auth, parseInput(uuid, id));
  }

  @Post('tournaments')
  create(
    @Auth() auth: AccessIdentity,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<TournamentDto> {
    return this.tournaments.create(auth, parseInput(uuid, id), body);
  }

  @Get('tournaments/:tournamentId')
  get(
    @Auth() auth: AccessIdentity,
    @Param('id') id: string,
    @Param('tournamentId') tid: string,
  ): Promise<TournamentDetailDto> {
    return this.tournaments.get(auth, parseInput(uuid, id), tid);
  }

  @Post('tournaments/:tournamentId/registrations')
  register(
    @Auth() auth: AccessIdentity,
    @Param('id') id: string,
    @Param('tournamentId') tid: string,
    @Body() body: unknown,
  ): Promise<PairDto> {
    return this.tournaments.register(auth, parseInput(uuid, id), tid, body);
  }

  @Delete('tournaments/:tournamentId/registrations/:registrationId')
  @HttpCode(204)
  withdraw(
    @Auth() auth: AccessIdentity,
    @Param('id') id: string,
    @Param('tournamentId') tid: string,
    @Param('registrationId') rid: string,
  ): Promise<void> {
    return this.tournaments.withdraw(auth, parseInput(uuid, id), tid, rid);
  }

  @Put('tournaments/:tournamentId/registrations/:registrationId/payment')
  @HttpCode(200)
  markPaid(
    @Auth() auth: AccessIdentity,
    @Param('id') id: string,
    @Param('tournamentId') tid: string,
    @Param('registrationId') rid: string,
  ): Promise<PairDto> {
    return this.tournaments.markPaid(auth, parseInput(uuid, id), tid, rid);
  }

  @Post('tournaments/:tournamentId/draw')
  @HttpCode(200)
  draw(
    @Auth() auth: AccessIdentity,
    @Param('id') id: string,
    @Param('tournamentId') tid: string,
    @Body() body: unknown,
  ): Promise<TournamentDetailDto> {
    return this.tournaments.draw(auth, parseInput(uuid, id), tid, body);
  }

  @Put('tournaments/:tournamentId/matches/:matchId/result')
  @HttpCode(200)
  report(
    @Auth() auth: AccessIdentity,
    @Param('id') id: string,
    @Param('tournamentId') tid: string,
    @Param('matchId') mid: string,
    @Body() body: unknown,
  ): Promise<TournamentDetailDto> {
    return this.tournaments.report(auth, parseInput(uuid, id), tid, mid, body);
  }

  @Put('tournaments/:tournamentId/matches/:matchId/result/confirmation')
  @HttpCode(200)
  confirm(
    @Auth() auth: AccessIdentity,
    @Param('id') id: string,
    @Param('tournamentId') tid: string,
    @Param('matchId') mid: string,
  ): Promise<TournamentDetailDto> {
    return this.tournaments.confirm(auth, parseInput(uuid, id), tid, mid);
  }

  @Get('tournament-ranking')
  ranking(
    @Auth() auth: AccessIdentity,
    @Param('id') id: string,
    @Query() query: unknown,
  ): Promise<TournamentRankingDto> {
    return this.tournaments.ranking(
      auth,
      parseInput(uuid, id),
      (query as { category?: unknown }).category,
    );
  }
}
