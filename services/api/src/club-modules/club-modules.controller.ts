import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';
import { parseInput } from '../common/zod';
import type { ClubModules } from './club-modules';
import { ClubModulesService } from './club-modules.service';

/** The flags are public like the club itself: the apps read them to hide what is off. */
@Controller('clubs')
export class ClubModulesController {
  constructor(private readonly modules: ClubModulesService) {}

  @Get(':id/modules')
  get(@Param('id') id: string): Promise<ClubModules> {
    return this.modules.get(parseInput(z.uuid(), id));
  }
}
