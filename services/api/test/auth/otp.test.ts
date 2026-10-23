import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OTP_STORE, type OtpStore } from '../../src/auth/otp/otp-store';
import { OtpService } from '../../src/auth/otp/otp.service';
import { AppError } from '../../src/errors/app-error';
import { createTestApp } from '../helpers';

const PHONE = '+5491155550123';

describe('WhatsApp one-time code', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let otp: OtpService;

  beforeEach(async () => {
    ctx = await createTestApp();
    otp = ctx.app.get(OtpService);
  });
  afterEach(() => ctx.app.close());

  const sentCode = (): string =>
    /\b(\d{6})\b/.exec(ctx.whatsapp.sent.at(-1)?.body ?? '')?.[1] ?? '';
  const wrongCode = (): string => (sentCode() === '000000' ? '000001' : '000000');
  const codeOf = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise;
      return 'OK';
    } catch (error) {
      return error instanceof AppError ? error.code : 'OTHER';
    }
  };

  it('sends a 6-digit code to the phone and reports the 5-minute lifetime', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/v1/auth/otp/whatsapp')
      .send({ phone: PHONE });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ expires_in_seconds: 300, resend_after_seconds: 60 });
    expect(ctx.whatsapp.sent).toHaveLength(1);
    expect(ctx.whatsapp.sent[0]?.to).toBe(PHONE);
    expect(sentCode()).toMatch(/^\d{6}$/);
  });

  it('rejects a phone that is not E.164', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/v1/auth/otp/whatsapp')
      .send({ phone: '11 5555 0123' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('accepts the right code once', async () => {
    await otp.request(PHONE);
    await expect(otp.verify(PHONE, sentCode())).resolves.toBeUndefined();
  });

  it('refuses to reuse a code that already worked', async () => {
    await otp.request(PHONE);
    const code = sentCode();
    await otp.verify(PHONE, code);
    expect(await codeOf(otp.verify(PHONE, code))).toBe('OTP_EXPIRED');
  });

  it('refuses the code after 5 minutes but not just before', async () => {
    await otp.request(PHONE);
    const code = sentCode();
    ctx.clock.advanceSeconds(299);
    await expect(otp.verify(PHONE, code)).resolves.toBeUndefined();

    await otp.request(PHONE);
    const second = sentCode();
    ctx.clock.advanceSeconds(300);
    expect(await codeOf(otp.verify(PHONE, second))).toBe('OTP_EXPIRED');
  });

  it('counts wrong attempts and locks after the 5th, even for the right code', async () => {
    await otp.request(PHONE);
    const right = sentCode();
    const remaining: unknown[] = [];
    for (let i = 0; i < 4; i += 1) {
      try {
        await otp.verify(PHONE, wrongCode());
      } catch (error) {
        expect((error as AppError).code).toBe('OTP_INVALID');
        remaining.push((error as AppError).details?.attempts_remaining);
      }
    }
    expect(remaining).toEqual([4, 3, 2, 1]);
    expect(await codeOf(otp.verify(PHONE, wrongCode()))).toBe('OTP_ATTEMPTS_EXCEEDED');
    expect(await codeOf(otp.verify(PHONE, right))).toBe('OTP_ATTEMPTS_EXCEEDED');
  });

  it('a new code resets the attempts and invalidates the previous one', async () => {
    await otp.request(PHONE);
    const first = sentCode();
    await codeOf(otp.verify(PHONE, wrongCode()));
    ctx.clock.advanceSeconds(61);
    await otp.request(PHONE);
    const second = sentCode();
    if (first !== second) {
      expect(await codeOf(otp.verify(PHONE, first))).toBe('OTP_INVALID');
    }
    await expect(otp.verify(PHONE, second)).resolves.toBeUndefined();
  });

  it('keeps the code and the attempt when the step before consuming fails', async () => {
    await otp.request(PHONE);
    const code = sentCode();
    const needsConsent = (): Promise<void> => Promise.reject(new AppError('TERMS_NOT_ACCEPTED'));
    for (let i = 0; i < 7; i += 1) {
      expect(await codeOf(otp.verify(PHONE, code, needsConsent))).toBe('TERMS_NOT_ACCEPTED');
    }
    await expect(otp.verify(PHONE, code)).resolves.toBeUndefined();
  });

  it('only lets one of two parallel uses of the same code win', async () => {
    await otp.request(PHONE);
    const code = sentCode();
    const results = await Promise.all([
      codeOf(otp.verify(PHONE, code)),
      codeOf(otp.verify(PHONE, code)),
    ]);
    expect(results.filter((r) => r === 'OK')).toHaveLength(1);
  });

  it('asking again within a minute is refused with Retry-After', async () => {
    const http = request(ctx.app.getHttpServer());
    await http.post('/v1/auth/otp/whatsapp').send({ phone: PHONE });
    const response = await http.post('/v1/auth/otp/whatsapp').send({ phone: PHONE });
    expect(response.status).toBe(429);
    expect(response.body.code).toBe('RATE_LIMITED');
    expect(response.headers['retry-after']).toBe('60');
    ctx.clock.advanceSeconds(60);
    const again = await http.post('/v1/auth/otp/whatsapp').send({ phone: PHONE });
    expect(again.status).toBe(202);
  });

  it('answers 503 and keeps no code when WhatsApp is down', async () => {
    ctx.whatsapp.failNext = 1;
    const response = await request(ctx.app.getHttpServer())
      .post('/v1/auth/otp/whatsapp')
      .send({ phone: PHONE });
    expect(response.status).toBe(503);
    const store = ctx.app.get<OtpStore>(OTP_STORE);
    expect(await store.get(PHONE)).toBeNull();
  });

  it('never stores or logs the code in clear', async () => {
    await otp.request(PHONE);
    const record = await ctx.app.get<OtpStore>(OTP_STORE).get(PHONE);
    expect(JSON.stringify(record)).not.toContain(sentCode());
    expect(JSON.stringify(ctx.logs())).not.toContain(sentCode());
  });
});
