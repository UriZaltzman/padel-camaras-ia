import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock';
import { ENV } from '../../config/env.module';
import type { Env } from '../../config/env';
import { AppError } from '../../errors/app-error';
import { authMessage } from '../../i18n/messages';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from '../../notifications/whatsapp-provider';
import { OTP_STORE, type OtpStore } from './otp-store';

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 300;
export const OTP_RESEND_AFTER_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;

const DEV_SECRET = 'development-only-otp-secret-not-for-production';

export interface OtpChallenge {
  expires_in_seconds: number;
  resend_after_seconds: number;
}

/** 6-digit WhatsApp codes: valid 5 minutes, 5 attempts, single use (spec section 12). */
@Injectable()
export class OtpService {
  private readonly secret: string;

  constructor(
    @Inject(OTP_STORE) private readonly store: OtpStore,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) env: Env,
  ) {
    this.secret = env.AUTH_OTP_SECRET ?? DEV_SECRET;
  }

  /** Sends a new code. Asking again within a minute is refused; later it replaces the old one. */
  async request(phone: string): Promise<OtpChallenge> {
    const nowMs = this.clock.now().getTime();
    const existing = await this.store.get(phone);
    if (existing && nowMs < existing.issuedAt + OTP_RESEND_AFTER_SECONDS * 1000) {
      const wait = Math.ceil((existing.issuedAt + OTP_RESEND_AFTER_SECONDS * 1000 - nowMs) / 1000);
      throw new AppError(
        'RATE_LIMITED',
        { retry_after_seconds: wait },
        { retryAfterSeconds: wait },
      );
    }

    const code = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
    await this.store.put(
      phone,
      {
        codeHash: this.hash(phone, code),
        attempts: 0,
        issuedAt: nowMs,
        expiresAt: nowMs + OTP_TTL_SECONDS * 1000,
      },
      OTP_TTL_SECONDS,
    );
    try {
      await this.whatsapp.send({
        to: phone,
        body: authMessage('otp_whatsapp', { code }),
        idempotencyKey: `otp:${phone}:${nowMs}`,
      });
    } catch (cause) {
      await this.store.remove(phone);
      throw new AppError('SERVICE_UNAVAILABLE', undefined, { cause });
    }
    return { expires_in_seconds: OTP_TTL_SECONDS, resend_after_seconds: OTP_RESEND_AFTER_SECONDS };
  }

  /**
   * Checks a code and burns it. `beforeConsume` runs once the code is right and may throw
   * (e.g. `TERMS_NOT_ACCEPTED`): then the code stays valid and the attempt is not counted.
   */
  async verify(phone: string, code: string, beforeConsume?: () => Promise<void>): Promise<void> {
    const record = await this.store.get(phone);
    if (!record || this.clock.now().getTime() >= record.expiresAt) {
      if (record) await this.store.remove(phone);
      throw new AppError('OTP_EXPIRED');
    }
    // Count first, so parallel guesses cannot all slip under the limit.
    const attempts = await this.store.addAttempt(phone);
    if (attempts === null) throw new AppError('OTP_EXPIRED');
    if (attempts > OTP_MAX_ATTEMPTS) throw new AppError('OTP_ATTEMPTS_EXCEEDED');

    if (!this.matches(record.codeHash, this.hash(phone, code))) {
      if (attempts >= OTP_MAX_ATTEMPTS) throw new AppError('OTP_ATTEMPTS_EXCEEDED');
      throw new AppError('OTP_INVALID', { attempts_remaining: OTP_MAX_ATTEMPTS - attempts });
    }

    if (beforeConsume) {
      try {
        await beforeConsume();
      } catch (error) {
        await this.store.refundAttempt(phone);
        throw error;
      }
    }
    if (!(await this.store.remove(phone))) throw new AppError('OTP_EXPIRED');
  }

  private hash(phone: string, code: string): string {
    return createHmac('sha256', this.secret).update(`${phone}:${code}`).digest('hex');
  }

  private matches(expected: string, actual: string): boolean {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
  }
}
