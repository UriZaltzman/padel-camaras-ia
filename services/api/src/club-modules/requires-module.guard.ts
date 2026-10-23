import {
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/app-error';
import type { ModuleName } from './club-modules';
import { ClubModulesService } from './club-modules.service';

const REQUIRED_MODULE = 'club-module:required';
const clubId = z.uuid();

/**
 * Answers 403 `CLUB_FEATURE_DISABLED` when the module is off for the club in the route
 * (`:clubId` or `:id`). Put it after the auth guard: `@RequiresModule('tournaments')`.
 */
@Injectable()
export class RequiresModuleGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ClubModulesService) private readonly modules: ClubModulesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const name = this.reflector.getAllAndOverride<ModuleName | undefined>(REQUIRED_MODULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!name) return true;
    const params = context.switchToHttp().getRequest<Request>().params;
    const parsed = clubId.safeParse(params['clubId'] ?? params['id']);
    if (!parsed.success) throw new AppError('NOT_FOUND');
    await this.modules.assertEnabled(parsed.data, name);
    return true;
  }
}

export const RequiresModule = (name: ModuleName) =>
  applyDecorators(SetMetadata(REQUIRED_MODULE, name), UseGuards(RequiresModuleGuard));
