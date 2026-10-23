import { Body, Controller, Get, HttpCode, Param, Put } from '@nestjs/common';
import { z } from 'zod';
import { ClubModulesService } from '../club-modules/club-modules.service';
import type { ClubModules } from '../club-modules/club-modules';
import { parseInput } from '../common/zod';
import { AppError } from '../errors/app-error';
import { setLogContext } from '../logging/request-context';
import { ClubsRepository } from '../clubs/clubs.repository';
import { StaffOnly, Staff } from './staff.guard';
import type { StaffMember } from './staff';

const idSchema = z.uuid();

/** `AdminClubModules` of the contract. */
export interface AdminClubModulesDto {
  club_id: string;
  modules: ClubModules;
  /** `null` until the subscription is priced from the API (billing is not wired yet). */
  estimated_monthly_cents: number | null;
  tariff_version_id: string | null;
}

/**
 * Feature flags of one club, for the internal console. Reading is open to every staff role;
 * writing to admin and sales. A club owner never reaches this: the guard looks at the staff
 * directory, not at club roles.
 */
@Controller('admin/clubs/:id/modules')
export class AdminModulesController {
  constructor(
    private readonly modules: ClubModulesService,
    private readonly clubs: ClubsRepository,
  ) {}

  @Get()
  @StaffOnly('admin', 'sales', 'support', 'finance')
  async get(@Param('id') id: string): Promise<AdminClubModulesDto> {
    const clubId = await this.existingClub(id);
    return this.present(clubId, await this.modules.get(clubId));
  }

  @Put()
  @HttpCode(200)
  @StaffOnly('admin', 'sales')
  async set(
    @Staff() staff: StaffMember,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminClubModulesDto> {
    const clubId = await this.existingClub(id);
    const saved = await this.modules.update(
      { role: 'support', userId: staff.userId },
      clubId,
      body,
    );
    return this.present(clubId, saved);
  }

  private async existingClub(raw: string): Promise<string> {
    const clubId = parseInput(idSchema, raw);
    setLogContext({ club_id: clubId });
    if (!(await this.clubs.findById(clubId))) throw new AppError('NOT_FOUND');
    return clubId;
  }

  private present(clubId: string, modules: ClubModules): AdminClubModulesDto {
    return { club_id: clubId, modules, estimated_monthly_cents: null, tariff_version_id: null };
  }
}
