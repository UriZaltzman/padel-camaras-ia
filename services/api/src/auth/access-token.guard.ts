import { createParamDecorator, Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../errors/app-error';
import { SessionService, type AccessIdentity } from './session/session.service';

export type AuthenticatedRequest = Request & { auth?: AccessIdentity };

/** Requires `Authorization: Bearer <access token>`; leaves the identity on `request.auth`. */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer (\S+)$/i.exec(request.headers.authorization ?? '');
    if (!match?.[1]) throw new AppError('UNAUTHENTICATED');
    request.auth = await this.sessions.authenticate(match[1]);
    return true;
  }
}

/** The authenticated identity of the request. Only valid on routes behind `AccessTokenGuard`. */
export const Auth = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.auth) throw new AppError('UNAUTHENTICATED');
  return request.auth;
});
