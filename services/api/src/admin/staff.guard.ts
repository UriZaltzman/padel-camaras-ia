import {
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
  applyDecorators,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SessionService } from '../auth/session/session.service';
import { AppError } from '../errors/app-error';
import type { StaffMember, StaffRole } from './staff';
import { StaffDirectory } from './staff-directory';

const ALLOWED_ROLES = 'staff:roles';
type StaffRequest = Request & { staff?: StaffMember };

/**
 * `/admin/*` entry gate: a valid access token whose user is internal staff with one of the
 * allowed roles. Fail closed: a route with no roles listed admits nobody, and a user who is not
 * in the directory (a club owner, a player) gets 403 whatever club roles they hold.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(StaffDirectory) private readonly directory: StaffDirectory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<StaffRequest>();
    const match = /^Bearer (\S+)$/i.exec(request.headers.authorization ?? '');
    if (!match?.[1]) throw new AppError('UNAUTHENTICATED');
    const identity = await this.sessions.authenticate(match[1]);

    const allowed =
      this.reflector.getAllAndOverride<readonly StaffRole[] | undefined>(ALLOWED_ROLES, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const member = await this.directory.find(identity.userId);
    if (!member || !allowed.includes(member.role)) throw new AppError('FORBIDDEN');
    request.staff = member;
    return true;
  }
}

/** `@StaffOnly('admin', 'sales')`: only those internal roles may call the route. */
export const StaffOnly = (...roles: StaffRole[]) =>
  applyDecorators(SetMetadata(ALLOWED_ROLES, roles), UseGuards(StaffGuard));

export const Staff = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const member = context.switchToHttp().getRequest<StaffRequest>().staff;
  if (!member) throw new AppError('UNAUTHENTICATED');
  return member;
});
