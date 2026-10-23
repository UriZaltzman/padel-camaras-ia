import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AccessTokenGuard, Auth } from '../auth/access-token.guard';
import type { AccessIdentity } from '../auth/session/session.service';
import { parseInput } from '../common/zod';
import { FavoritesService, MAX_FAVORITE_CLUBS } from './favorites.service';

const idSchema = z.uuid();
const reorderBody = z.object({ club_ids: z.array(z.uuid()).max(MAX_FAVORITE_CLUBS) }).strict();
const clubQuery = z.object({ club_id: z.uuid() });

@Controller()
@UseGuards(AccessTokenGuard)
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get('me/favorite-clubs')
  list(@Auth() auth: AccessIdentity) {
    return this.favorites.list(auth);
  }

  @Put('me/favorite-clubs')
  @HttpCode(200)
  reorder(@Auth() auth: AccessIdentity, @Body() body: unknown) {
    return this.favorites.reorder(auth, parseInput(reorderBody, body).club_ids);
  }

  @Put('me/favorite-clubs/:clubId')
  @HttpCode(200)
  add(@Auth() auth: AccessIdentity, @Param('clubId') clubId: string) {
    return this.favorites.add(auth, parseInput(idSchema, clubId));
  }

  @Delete('me/favorite-clubs/:clubId')
  @HttpCode(204)
  async remove(@Auth() auth: AccessIdentity, @Param('clubId') clubId: string): Promise<void> {
    await this.favorites.remove(auth, parseInput(idSchema, clubId));
  }

  @Get('me/home')
  home(@Auth() auth: AccessIdentity) {
    return this.favorites.home(auth);
  }

  @Get('club-admin/favorite-count')
  count(@Auth() auth: AccessIdentity, @Query() query: unknown) {
    return this.favorites.countForClub(auth, parseInput(clubQuery, query).club_id);
  }
}
