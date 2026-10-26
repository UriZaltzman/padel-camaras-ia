import { Body, Controller, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { parseInput } from '../../common/zod';
import { AccessTokenGuard, Auth } from '../access-token.guard';
import type { AuthSession } from '../auth.service';
import type { AccessIdentity, TokenPair } from '../session/session.service';
import { CredentialsService, type TotpEnrollment } from './credentials.service';
import { PASSWORD_MAX_LENGTH } from './password-policy';

const email = z.string().trim().min(3).max(254).pipe(z.email());
/** Any length up to a body-size bound and any Unicode; the strength rules apply when it is set. */
const password = z.string().min(1).max(PASSWORD_MAX_LENGTH);
const totpCode = z.string().regex(/^[0-9]{6}$/);

const loginSchema = z.object({ email, password, totp_code: totpCode.optional() }).strict();
const enrollSchema = z.object({ email, password }).strict();
const confirmSchema = z.object({ email, password, totp_code: totpCode }).strict();
const forgotSchema = z.object({ email }).strict();
const resetSchema = z
  .object({ token: z.string().min(1).max(128), new_password: password })
  .strict();
const changeSchema = z.object({ current_password: password, new_password: password }).strict();

const ipOf = (request: Request): string => request.ip ?? 'unknown';

@Controller('auth')
export class CredentialsController {
  constructor(@Inject(CredentialsService) private readonly credentials: CredentialsService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown, @Req() request: Request): Promise<AuthSession> {
    const input = parseInput(loginSchema, body);
    return this.credentials.login({
      email: input.email,
      password: input.password,
      totpCode: input.totp_code,
      ip: ipOf(request),
    });
  }

  @Post('2fa/enroll')
  @HttpCode(200)
  enroll(@Body() body: unknown, @Req() request: Request): Promise<TotpEnrollment> {
    const input = parseInput(enrollSchema, body);
    return this.credentials.startTotpEnrollment({ ...input, ip: ipOf(request) });
  }

  @Post('2fa/confirm')
  @HttpCode(200)
  confirm(@Body() body: unknown, @Req() request: Request): Promise<AuthSession> {
    const input = parseInput(confirmSchema, body);
    return this.credentials.confirmTotpEnrollment({
      email: input.email,
      password: input.password,
      totpCode: input.totp_code,
      ip: ipOf(request),
    });
  }

  @Post('password/forgot')
  @HttpCode(202)
  async forgot(@Body() body: unknown, @Req() request: Request): Promise<Record<string, never>> {
    const input = parseInput(forgotSchema, body);
    await this.credentials.forgotPassword({ email: input.email, ip: ipOf(request) });
    return {};
  }

  @Post('password/reset')
  @HttpCode(204)
  async reset(@Body() body: unknown, @Req() request: Request): Promise<void> {
    const input = parseInput(resetSchema, body);
    await this.credentials.resetPassword({
      token: input.token,
      newPassword: input.new_password,
      ip: ipOf(request),
    });
  }

  @Post('password/change')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  change(
    @Auth() identity: AccessIdentity,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<TokenPair> {
    const input = parseInput(changeSchema, body);
    return this.credentials.changePassword({
      userId: identity.userId,
      mfa: identity.mfa === true,
      currentPassword: input.current_password,
      newPassword: input.new_password,
      ip: ipOf(request),
    });
  }
}
