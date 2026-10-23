import { Injectable } from '@nestjs/common';
import { parseInput } from '../common/zod';
import type { DbContext } from '../db/db-context';
import { AppError } from '../errors/app-error';
import { currentLogContext } from '../logging/request-context';
import {
  DEFAULT_MODULES,
  clubModulesUpdateSchema,
  findModuleIssues,
  isModuleOn,
  type ClubModules,
  type ModuleName,
} from './club-modules';
import { ClubModulesRepository } from './club-modules.repository';

// Flags are read for the club as the system: the check must not depend on who asks.
const system = (clubId: string): DbContext => ({ role: 'system', clubId });

@Injectable()
export class ClubModulesService {
  constructor(private readonly repository: ClubModulesRepository) {}

  /** The flags of a club; defaults when it has none yet. */
  async get(clubId: string): Promise<ClubModules> {
    return (await this.repository.find(system(clubId), clubId)) ?? DEFAULT_MODULES;
  }

  /** Throws `CLUB_FEATURE_DISABLED` (403) when the module is off for the club. */
  async assertEnabled(clubId: string, name: ModuleName): Promise<void> {
    if (!isModuleOn(await this.get(clubId), name)) throw new AppError('CLUB_FEATURE_DISABLED');
  }

  /**
   * Replaces the flags. For internal staff (the `/admin` console); the caller has already
   * checked the role and passes the `support` context.
   */
  async update(
    ctx: DbContext & { userId: string },
    clubId: string,
    body: unknown,
  ): Promise<ClubModules> {
    const { modules } = parseInput(clubModulesUpdateSchema, body);
    const issues = findModuleIssues(modules);
    if (issues.length > 0) throw new AppError('VALIDATION_FAILED', { issues });
    await this.repository.replace(ctx, clubId, modules, {
      actorUserId: ctx.userId,
      requestId: currentLogContext()?.request_id,
    });
    return modules;
  }
}
