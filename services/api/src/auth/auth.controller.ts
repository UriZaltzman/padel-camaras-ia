import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { parseInput } from '../common/zod';
import { OtpService, type OtpChallenge } from './otp/otp.service';

/** E.164 with country code, as in the contract's `PhoneNumber`. */
export const phoneSchema = z.string().regex(/^\+[1-9][0-9]{7,14}$/);

const otpRequestSchema = z.object({ phone: phoneSchema }).strict();

@Controller('auth')
export class AuthController {
  constructor(private readonly otp: OtpService) {}

  @Post('otp/whatsapp')
  @HttpCode(202)
  requestOtp(@Body() body: unknown): Promise<OtpChallenge> {
    const { phone } = parseInput(otpRequestSchema, body);
    return this.otp.request(phone);
  }
}
