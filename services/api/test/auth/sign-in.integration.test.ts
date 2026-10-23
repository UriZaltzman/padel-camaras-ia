import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers';
import { adminUrl, createScratchDb, psql } from '../db/scratch-db';

// WhatsApp sign-in end to end against a real Postgres (users are protected by RLS).
describe.skipIf(!adminUrl)('POST /auth/otp/verify', () => {
  const db = adminUrl ? createScratchDb('signin') : { url: '', drop: () => undefined };
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const consent = { terms_version: '2026-10-01', privacy_version: '2026-10-01' };

  beforeAll(async () => {
    ctx = await createTestApp([], { databaseUrl: db.url });
  });
  afterAll(async () => {
    await ctx.app.close();
    db.drop();
  });

  const http = () => request(ctx.app.getHttpServer());
  const requestCode = async (phone: string): Promise<string> => {
    ctx.clock.advanceSeconds(61);
    await http().post('/v1/auth/otp/whatsapp').send({ phone });
    return /\b(\d{6})\b/.exec(ctx.whatsapp.sent.at(-1)?.body ?? '')?.[1] ?? '';
  };

  it('creates the account on first sign-in, with consent, and returns a session', async () => {
    const phone = '+5491155550001';
    const code = await requestCode(phone);
    const response = await http().post('/v1/auth/otp/verify').send({ phone, code, consent });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      is_new_user: true,
      token_type: 'Bearer',
      expires_in: 900,
      user: { phone, terms_version: '2026-10-01', privacy_version: '2026-10-01' },
    });
    const stored = psql(db.url, `SELECT count(*) FROM users WHERE phone = '${phone}'`);
    expect(stored).toBe('1');
  });

  it('asks for consent from a new phone and keeps the code valid', async () => {
    const phone = '+5491155550002';
    const code = await requestCode(phone);
    const without = await http().post('/v1/auth/otp/verify').send({ phone, code });
    expect(without.status).toBe(403);
    expect(without.body.code).toBe('TERMS_NOT_ACCEPTED');
    expect(psql(db.url, `SELECT count(*) FROM users WHERE phone = '${phone}'`)).toBe('0');
    const retry = await http().post('/v1/auth/otp/verify').send({ phone, code, consent });
    expect(retry.status).toBe(200);
    expect(retry.body.is_new_user).toBe(true);
  });

  it('signs an existing user in again, ignoring consent', async () => {
    const phone = '+5491155550003';
    const firstCode = await requestCode(phone);
    const first = await http()
      .post('/v1/auth/otp/verify')
      .send({ phone, code: firstCode, consent });
    const secondCode = await requestCode(phone);
    const second = await http().post('/v1/auth/otp/verify').send({ phone, code: secondCode });
    expect(second.status).toBe(200);
    expect(second.body.is_new_user).toBe(false);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(psql(db.url, `SELECT count(*) FROM users WHERE phone = '${phone}'`)).toBe('1');
  });

  it('answers OTP_INVALID with the attempts left', async () => {
    const phone = '+5491155550004';
    const code = await requestCode(phone);
    const wrong = code === '000000' ? '000001' : '000000';
    const response = await http().post('/v1/auth/otp/verify').send({ phone, code: wrong, consent });
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: 'OTP_INVALID',
      details: { attempts_remaining: 4 },
    });
  });
});
