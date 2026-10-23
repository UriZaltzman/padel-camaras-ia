import {
  Body,
  Controller,
  Delete,
  Get,
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
import {
  CourtBlocksService,
  MAX_BLOCK_OCCURRENCES,
  type BlockDto,
  type BlockResultDto,
} from './court-blocks.service';

const idSchema = z.uuid();
const policy = z.enum(['cancel_and_refund', 'move', 'abort']);
const courtIds = z.array(z.uuid()).min(1).max(20);

const createBody = z
  .object({
    court_ids: courtIds,
    starts_at: z.iso.datetime(),
    ends_at: z.iso.datetime(),
    kind: z.enum(['maintenance', 'holiday', 'closure']),
    reason: z.string().trim().min(1).max(200).optional(),
    recurrence: z
      .object({ frequency: z.enum(['daily', 'weekly']), until: z.iso.date() })
      .strict()
      .optional(),
    existing_bookings_policy: policy.optional(),
  })
  .strict();
const holidaysBody = z
  .object({
    year: z.number().int().min(2026).max(2100),
    court_ids: courtIds,
    dates: z.array(z.iso.date()).min(1).max(MAX_BLOCK_OCCURRENCES).optional(),
    existing_bookings_policy: policy.optional(),
  })
  .strict();
const listQuery = z.object({ from: z.iso.datetime(), to: z.iso.datetime() });

@Controller('clubs/:clubId/court-blocks')
@UseGuards(AccessTokenGuard)
export class CourtBlocksController {
  constructor(private readonly blocks: CourtBlocksService) {}

  @Post()
  @HttpCode(201)
  create(
    @Auth() auth: AccessIdentity,
    @Param('clubId') clubId: string,
    @Body() body: unknown,
  ): Promise<BlockResultDto> {
    return this.blocks.create(auth, parseInput(idSchema, clubId), parseInput(createBody, body));
  }

  /** Imports the national holidays of a year (or the given dates) as full-day blocks. */
  @Post('holidays')
  @HttpCode(201)
  importHolidays(
    @Auth() auth: AccessIdentity,
    @Param('clubId') clubId: string,
    @Body() body: unknown,
  ): Promise<BlockResultDto> {
    return this.blocks.importHolidays(
      auth,
      parseInput(idSchema, clubId),
      parseInput(holidaysBody, body),
    );
  }

  @Get()
  list(
    @Auth() auth: AccessIdentity,
    @Param('clubId') clubId: string,
    @Query() query: unknown,
  ): Promise<BlockDto[]> {
    const q = parseInput(listQuery, query);
    return this.blocks.list(auth, parseInput(idSchema, clubId), {
      from: new Date(q.from),
      to: new Date(q.to),
    });
  }

  @Delete(':blockId')
  @HttpCode(204)
  async remove(
    @Auth() auth: AccessIdentity,
    @Param('clubId') clubId: string,
    @Param('blockId') blockId: string,
  ): Promise<void> {
    await this.blocks.remove(auth, parseInput(idSchema, clubId), parseInput(idSchema, blockId));
  }
}
