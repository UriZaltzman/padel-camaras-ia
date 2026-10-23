import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { parseInput } from '../common/zod';
import { AuthService, type AuthSession } from './auth.service';
import { OtpService, type OtpChallenge } from './otp/otp.service';
import { SessionService, type TokenPair } from './session/session.service';

/** E.164 with country code, as in the contract's `PhoneNumber`. */
export const phoneSchema = z.string().regex(/^\+[1-9][0-9]{7,14}$/);

const otpRequestSchema = z.object({ phone: phoneSchema }).strict();

const otpVerifySchema = z
  .object({
    phone: phoneSchema,
    code: z.string().regex(/^[0-9]{6}$/),
    consent: z
      .object({
        terms_version: z.string().min(1).max(32),
        privacy_version: z.string().min(1).max(32),
      })
      .optional(),
  })
  .strict();

const refreshSchema = z.object({ refresh_token: z.string().min(1).max(512) }).strict();

@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post('otp/whatsapp')
  @HttpCode(202)
  requestOtp(@Body() body: unknown): Promise<OtpChallenge> {
    const { phone } = parseInput(otpRequestSchema, body);
    return this.otp.request(phone);
  }

  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body() body: unknown): Promise<AuthSession> {
    const { phone, code, consent } = parseInput(otpVerifySchema, body);
    return this.auth.verifyWhatsappOtp(phone, code, consent);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown): Promise<TokenPair> {
    const { refresh_token } = parseInput(refreshSchema, body);
    return this.sessions.refresh(refresh_token);
  }
}
