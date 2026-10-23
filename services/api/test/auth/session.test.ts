import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JwtSigner } from '../../src/auth/session/jwt';
import { SessionService } from '../../src/auth/session/session.service';
import { newId } from '../../src/db/ids';
import { AppError } from '../../src/errors/app-error';
import { createTestApp } from '../helpers';

describe('session tokens', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let sessions: SessionService;
  const userId = newId();

  beforeEach(async () => {
    ctx = await createTestApp();
    sessions = ctx.app.get(SessionService);
  });
  afterEach(() => ctx.app.close());

  const codeOf = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise;
      return 'OK';
    } catch (error) {
      return error instanceof AppError ? error.code : 'OTHER';
    }
  };

  it('issues a Bearer pair: access valid for 900 s, refresh for 30 days', async () => {
    const pair = await sessions.issue(userId);
    expect(pair).toMatchObject({ token_type: 'Bearer', expires_in: 900 });
    expect(pair.refresh_token).toMatch(/^rt_[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/);
    expect(await sessions.authenticate(pair.access_token)).toMatchObject({ userId });
  });

  it('the access token works for 15 minutes and then reports ACCESS_TOKEN_EXPIRED', async () => {
    const { access_token } = await sessions.issue(userId);
    ctx.clock.advanceSeconds(899);
    await expect(sessions.authenticate(access_token)).resolves.toMatchObject({ userId });
    ctx.clock.advanceSeconds(1);
    expect(await codeOf(sessions.authenticate(access_token))).toBe('ACCESS_TOKEN_EXPIRED');
  });

  it('refuses a tampered or foreign-signed access token', async () => {
    const { access_token } = await sessions.issue(userId);
    const [h, p, s] = access_token.split('.') as [string, string, string];
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: newId(), sid: 'x', iat: 0, exp: 9_999_999_999 }),
    ).toString('base64url');
    expect(await codeOf(sessions.authenticate(`${h}.${forgedPayload}.${s}`))).toBe(
      'UNAUTHENTICATED',
    );
    const foreign = new JwtSigner().sign({ sub: userId, sid: 'x', iat: 0, exp: 9_999_999_999 });
    expect(await codeOf(sessions.authenticate(foreign))).toBe('UNAUTHENTICATED');
    expect(await codeOf(sessions.authenticate(`${h}.${p}`))).toBe('UNAUTHENTICATED');
    expect(await codeOf(sessions.authenticate('nonsense'))).toBe('UNAUTHENTICATED');
  });

  it('rotates the refresh token on every use', async () => {
    const first = await sessions.issue(userId);
    const second = await sessions.refresh(first.refresh_token);
    const third = await sessions.refresh(second.refresh_token);
    expect(new Set([first.refresh_token, second.refresh_token, third.refresh_token]).size).toBe(3);
    expect(await sessions.authenticate(third.access_token)).toMatchObject({ userId });
  });

  it('a refresh token used twice invalidates the whole session', async () => {
    const first = await sessions.issue(userId);
    const second = await sessions.refresh(first.refresh_token);

    // The old token comes back (a stolen copy): refused, and the family is revoked.
    expect(await codeOf(sessions.refresh(first.refresh_token))).toBe('REFRESH_TOKEN_INVALID');
    expect(await codeOf(sessions.refresh(second.refresh_token))).toBe('REFRESH_TOKEN_INVALID');
    expect(await codeOf(sessions.authenticate(second.access_token))).toBe('UNAUTHENTICATED');
  });

  it('a different session of the same user is not affected by the revoked one', async () => {
    const phone = await sessions.issue(userId);
    const laptop = await sessions.issue(userId);
    const phoneNext = await sessions.refresh(phone.refresh_token);
    await codeOf(sessions.refresh(phone.refresh_token));
    expect(await codeOf(sessions.refresh(phoneNext.refresh_token))).toBe('REFRESH_TOKEN_INVALID');
    await expect(sessions.refresh(laptop.refresh_token)).resolves.toBeDefined();
  });

  it('only one of two parallel refreshes with the same token wins', async () => {
    const pair = await sessions.issue(userId);
    const results = await Promise.all([
      codeOf(sessions.refresh(pair.refresh_token)),
      codeOf(sessions.refresh(pair.refresh_token)),
    ]);
    expect(results.filter((r) => r === 'OK')).toHaveLength(1);
  });

  it('refuses a wrong secret, an unknown id and a malformed token', async () => {
    const pair = await sessions.issue(userId);
    const [id] = pair.refresh_token.slice(3).split('.') as [string];
    expect(await codeOf(sessions.refresh(`rt_${id}.${'a'.repeat(43)}`))).toBe(
      'REFRESH_TOKEN_INVALID',
    );
    expect(await codeOf(sessions.refresh(`rt_${newId()}.${'a'.repeat(43)}`))).toBe(
      'REFRESH_TOKEN_INVALID',
    );
    expect(await codeOf(sessions.refresh('garbage'))).toBe('REFRESH_TOKEN_INVALID');
  });

  it('POST /auth/refresh returns a new pair, and 401 when the token is reused', async () => {
    const http = request(ctx.app.getHttpServer());
    const pair = await sessions.issue(userId);
    const ok = await http.post('/v1/auth/refresh').send({ refresh_token: pair.refresh_token });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ token_type: 'Bearer', expires_in: 900 });
    const reused = await http.post('/v1/auth/refresh').send({ refresh_token: pair.refresh_token });
    expect(reused.status).toBe(401);
    expect(reused.body.code).toBe('REFRESH_TOKEN_INVALID');
  });
});
