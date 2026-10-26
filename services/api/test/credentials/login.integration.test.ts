import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { hash as argonHash } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CredentialsService } from '../../src/auth/credentials/credentials.service';
import { OTP_STORE, type OtpStore } from '../../src/auth/otp/otp-store';
import { PasswordHasher } from '../../src/auth/credentials/password-hasher';
import { base32Decode, totpAt, totpStep } from '../../src/auth/credentials/totp';
import { SessionService } from '../../src/auth/session/session.service';
import { newId } from '../../src/db/ids';
import { adminUrl, createScratchDb, psql } from '../db/scratch-db';
import { createTestApp } from '../helpers';

// Password sign-in end to end against a real Postgres: lock-out, enumeration, reset, rehash, 2FA,
// and a scan of the database dump, the audit log, the logs and every response for secrets.

const OWNER_PASSWORD = 'la cancha tres tiene red nueva';
const NEW_PASSWORD = 'otra frase larga y distinta 2026';
const STAFF_PASSWORD = 'frase interna de ayuda 77';
const IP = '203.0.113.9';

describe.skipIf(!adminUrl)('password login (#343)', () => {
  const db = adminUrl ? createScratchDb('pwlogin') : { url: '', drop: () => undefined };
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let credentials: CredentialsService;
  let hasher: PasswordHasher;
  const owner = { id: newId(), email: 'duenio@club.test' };
  const staff = { id: newId(), email: 'soporte@interno.test' };
  /** Every secret that went through the API, to look for in logs, audit and the dump. */
  const secrets = new Set<string>([OWNER_PASSWORD, NEW_PASSWORD, STAFF_PASSWORD]);
  const bodies: string[] = [];

  const http = () => request(ctx.app.getHttpServer());
  const post = async (path: string, body: unknown, ip = IP, token?: string) => {
    const req = http().post(`/v1${path}`).set('X-Forwarded-For', ip);
    if (token) req.set('Authorization', `Bearer ${token}`);
    const res = await req.send(body as object);
    bodies.push(JSON.stringify(res.body ?? {}), res.text ?? '');
    return res;
  };
  const login = (email: string, password: string, extra: object = {}, ip = IP) =>
    post('/auth/login', { email, password, ...extra }, ip);
  const code = (secret: string, offsetSteps = 0) =>
    totpAt(base32Decode(secret), totpStep(ctx.clock.now().getTime()) + offsetSteps);
  const dump = () =>
    execFileSync('pg_dump', ['--data-only', '--inserts', db.url], { encoding: 'utf8' });

  beforeAll(async () => {
    ctx = await createTestApp([], { databaseUrl: db.url });
    ctx.app.getHttpAdapter().getInstance().set('trust proxy', true);
    credentials = ctx.app.get(CredentialsService);
    hasher = ctx.app.get(PasswordHasher);
    await credentials.provision({
      userId: owner.id,
      name: 'Dueño',
      email: owner.email,
      password: OWNER_PASSWORD,
    });
    await credentials.provision({
      userId: staff.id,
      name: 'Soporte',
      email: staff.email,
      password: STAFF_PASSWORD,
    });
    ctx.staff.members.set(staff.id, { userId: staff.id, role: 'support', secondFactor: 'totp' });
  }, 60_000);

  afterAll(async () => {
    await ctx.app.close();
    db.drop();
  });

  it('stores an Argon2id PHC hash and never the password', () => {
    const rows = psql(db.url, 'SELECT password_hash, pepper_version FROM user_credentials').split(
      '\n',
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[^$|]+\$[^$|]+\|1$/);
    }
    const all = dump();
    for (const secret of [OWNER_PASSWORD, STAFF_PASSWORD]) expect(all).not.toContain(secret);
  });

  it('signs a club owner in and returns a session', async () => {
    const res = await login(owner.email.toUpperCase(), OWNER_PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      token_type: 'Bearer',
      is_new_user: false,
      user: { id: owner.id, email: owner.email },
    });
    const me = await http()
      .get('/v1/me/favorite-clubs')
      .set('Authorization', `Bearer ${res.body.access_token}`);
    expect(me.status).toBe(200);
  });

  it('answers a wrong password and an unknown email identically, with the work of a check', async () => {
    const dummy = vi.spyOn(hasher, 'verifyDummy');
    const real = vi.spyOn(hasher, 'verify');
    const wrong = await login(owner.email, 'una frase equivocada pero larga', {}, '198.51.100.1');
    const unknown = await login(
      'nadie@club.test',
      'una frase equivocada pero larga',
      {},
      '198.51.100.2',
    );
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    expect(
      Object.keys(unknown.headers).filter((h) => /^(set-cookie|retry-after)$/.test(h)),
    ).toEqual(Object.keys(wrong.headers).filter((h) => /^(set-cookie|retry-after)$/.test(h)));
    expect(real).toHaveBeenCalledTimes(1);
    expect(dummy).toHaveBeenCalledTimes(1);
    dummy.mockRestore();
    real.mockRestore();
  });

  it('takes comparable time for known and unknown accounts', async () => {
    const time = async (email: string, ip: string) => {
      const start = process.hrtime.bigint();
      await login(email, 'una frase equivocada pero larga', {}, ip);
      return Number(process.hrtime.bigint() - start) / 1e6;
    };
    const known: number[] = [];
    const unknown: number[] = [];
    for (let i = 0; i < 4; i++) {
      known.push(await time(owner.email, `198.51.100.${10 + i}`));
      unknown.push(await time(`nadie${i}@club.test`, `198.51.100.${20 + i}`));
      ctx.throttle.reset(`login:acct:${createHash('sha256').update(owner.email).digest('hex')}`);
    }
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
    // Argon2 dominates both; a missing hash would make "unknown" an order of magnitude faster.
    expect(median(unknown)).toBeGreaterThan(median(known) * 0.5);
  });

  it('locks an account after 5 failures, for real and invented emails alike, and unlocks later', async () => {
    for (const email of ['bloqueo@club.test', owner.email]) {
      const ip = email === owner.email ? '192.0.2.50' : '192.0.2.51';
      for (let i = 0; i < 5; i++) {
        expect((await login(email, 'no es esta frase larga', {}, ip)).status).toBe(401);
      }
      const locked = await login(email, OWNER_PASSWORD, {}, ip);
      expect(locked.status).toBe(429);
      expect(locked.body.code).toBe('RATE_LIMITED');
      expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
      // Even the right password does not get in while locked.
      expect((await login(email, OWNER_PASSWORD, {}, '192.0.2.99')).status).toBe(429);
    }
    ctx.clock.advanceSeconds(901);
    expect((await login(owner.email, OWNER_PASSWORD, {}, '192.0.2.60')).status).toBe(200);
  });

  it('locks an IP address after 30 failures across different emails', async () => {
    const ip = '192.0.2.77';
    for (let i = 0; i < 30; i++)
      await login(`probe${i}@club.test`, 'una frase de prueba larga', {}, ip);
    const res = await login(owner.email, OWNER_PASSWORD, {}, ip);
    expect(res.status).toBe(429);
    ctx.clock.advanceSeconds(901);
  });

  it('rehashes a hash made with older parameters at the next login', async () => {
    const weak = await argonHash(hasher['prehash'](OWNER_PASSWORD, 1), {
      memoryCost: 4096,
      timeCost: 1,
      parallelism: 1,
      algorithm: 2,
    });
    psql(
      db.url,
      `UPDATE user_credentials SET password_hash = '${weak}' WHERE user_id = '${owner.id}'`,
    );
    const res = await login(owner.email, OWNER_PASSWORD, {}, '192.0.2.70');
    expect(res.status).toBe(200);
    const stored = psql(
      db.url,
      `SELECT password_hash FROM user_credentials WHERE user_id = '${owner.id}'`,
    );
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(stored).not.toBe(weak);
    expect(
      psql(db.url, "SELECT count(*) FROM audit_log WHERE action = 'auth.password_rehashed'"),
    ).toBe('1');
    expect((await login(owner.email, OWNER_PASSWORD, {}, '192.0.2.71')).status).toBe(200);
  });

  describe('password reset', () => {
    it('answers the same for known and unknown emails and sends the link only for the known', async () => {
      const known = await post('/auth/password/forgot', { email: owner.email }, '192.0.2.80');
      const unknown = await post(
        '/auth/password/forgot',
        { email: 'nadie@club.test' },
        '192.0.2.81',
      );
      await credentials.drain();
      expect(known.status).toBe(202);
      expect(unknown.status).toBe(202);
      expect(unknown.body).toEqual(known.body);
      expect(ctx.resetSender.sent).toHaveLength(1);
      expect(ctx.resetSender.sent[0]?.email).toBe(owner.email);
    });

    it('keeps only the hash of the token, valid 30 minutes, single use', async () => {
      const { token, expiresAt } = ctx.resetSender.sent.at(-1) ?? {
        token: '',
        expiresAt: new Date(0),
      };
      secrets.add(token);
      expect(token.length).toBeGreaterThanOrEqual(43);
      expect(dump()).not.toContain(token);
      expect(
        psql(db.url, `SELECT token_hash FROM password_reset_tokens WHERE user_id = '${owner.id}'`),
      ).toBe(createHash('sha256').update(token).digest('hex'));
      expect(expiresAt.getTime() - ctx.clock.now().getTime()).toBe(30 * 60 * 1000);

      // A weak new password is refused and does not burn the link.
      const weak = await post(
        '/auth/password/reset',
        { token, new_password: 'password123' },
        '192.0.2.82',
      );
      expect(weak.status).toBe(422);
      expect(weak.body.code).toBe('WEAK_PASSWORD');

      const before = await login(owner.email, OWNER_PASSWORD, {}, '192.0.2.83');
      const refresh = before.body.refresh_token as string;
      const access = before.body.access_token as string;

      const ok = await post(
        '/auth/password/reset',
        { token, new_password: NEW_PASSWORD },
        '192.0.2.82',
      );
      expect(ok.status).toBe(204);

      // Single use.
      const again = await post(
        '/auth/password/reset',
        { token, new_password: `${NEW_PASSWORD}!` },
        '192.0.2.82',
      );
      expect(again.status).toBe(401);
      expect(again.body.code).toBe('PASSWORD_RESET_TOKEN_INVALID');

      // Every other session ended: access token and refresh token.
      expect(
        (await http().get('/v1/me/favorite-clubs').set('Authorization', `Bearer ${access}`)).status,
      ).toBe(401);
      expect((await post('/auth/refresh', { refresh_token: refresh })).status).toBe(401);

      // The old password is gone, the new one works.
      expect((await login(owner.email, OWNER_PASSWORD, {}, '192.0.2.84')).status).toBe(401);
      expect((await login(owner.email, NEW_PASSWORD, {}, '192.0.2.85')).status).toBe(200);
    });

    it('refuses an expired link and an invented one the same way', async () => {
      await post('/auth/password/forgot', { email: owner.email }, '192.0.2.86');
      await credentials.drain();
      const { token } = ctx.resetSender.sent.at(-1) ?? { token: '' };
      secrets.add(token);
      ctx.clock.advanceSeconds(30 * 60 + 1);
      const expired = await post(
        '/auth/password/reset',
        { token, new_password: NEW_PASSWORD },
        '192.0.2.87',
      );
      const invented = await post(
        '/auth/password/reset',
        { token: 'x'.repeat(43), new_password: NEW_PASSWORD },
        '192.0.2.88',
      );
      expect(expired.status).toBe(401);
      expect(invented.body).toEqual(expired.body);
    });

    it('asking again replaces the earlier link', async () => {
      await post('/auth/password/forgot', { email: owner.email }, '192.0.2.89');
      await credentials.drain();
      await post('/auth/password/forgot', { email: owner.email }, '192.0.2.90');
      await credentials.drain();
      const [first, second] = ctx.resetSender.sent.slice(-2);
      const res1 = await post(
        '/auth/password/reset',
        { token: first?.token, new_password: NEW_PASSWORD },
        '192.0.2.91',
      );
      expect(res1.status).toBe(401);
      const res2 = await post(
        '/auth/password/reset',
        { token: second?.token, new_password: NEW_PASSWORD },
        '192.0.2.91',
      );
      expect(res2.status).toBe(204);
    });
  });

  it('changes the password while signed in and ends the other sessions', async () => {
    const a = await login(owner.email, NEW_PASSWORD, {}, '192.0.2.100');
    const b = await login(owner.email, NEW_PASSWORD, {}, '192.0.2.101');
    const wrong = await post(
      '/auth/password/change',
      { current_password: 'no es la frase larga', new_password: OWNER_PASSWORD },
      '192.0.2.102',
      a.body.access_token,
    );
    expect(wrong.status).toBe(401);
    const changed = await post(
      '/auth/password/change',
      { current_password: NEW_PASSWORD, new_password: OWNER_PASSWORD },
      '192.0.2.102',
      a.body.access_token,
    );
    expect(changed.status).toBe(200);
    expect(
      (
        await http()
          .get('/v1/me/favorite-clubs')
          .set('Authorization', `Bearer ${b.body.access_token}`)
      ).status,
    ).toBe(401);
    expect(
      (
        await http()
          .get('/v1/me/favorite-clubs')
          .set('Authorization', `Bearer ${changed.body.access_token}`)
      ).status,
    ).toBe(200);
  });

  describe('internal staff: second factor is mandatory', () => {
    let secret = '';
    const adminUrlPath = `/v1/admin/clubs/${newId()}/modules`;

    it('does not let staff in with the password alone, and says they must enrol', async () => {
      const res = await login(staff.email, STAFF_PASSWORD, {}, '192.0.2.110');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SECOND_FACTOR_REQUIRED');
      expect(res.body.details).toEqual({ enrollment_required: true });
      expect(res.body.access_token).toBeUndefined();
    });

    it('does not let a session without the second factor into the console, whatever the allowlist', async () => {
      const sessions = ctx.moduleRef.get(SessionService);
      const plain = (await sessions.issue(staff.id)).access_token;
      expect((await http().get(adminUrlPath).set('Authorization', `Bearer ${plain}`)).status).toBe(
        401,
      );
      const withMfa = (await sessions.issue(staff.id, { mfa: true })).access_token;
      expect(
        [401, 403].includes(
          (await http().get(adminUrlPath).set('Authorization', `Bearer ${withMfa}`)).status,
        ),
      ).toBe(false);
    });

    it('only staff can enrol, and only after proving the password', async () => {
      expect(
        (
          await post(
            '/auth/2fa/enroll',
            { email: owner.email, password: OWNER_PASSWORD },
            '192.0.2.111',
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await post(
            '/auth/2fa/enroll',
            { email: staff.email, password: 'una frase equivocada larga' },
            '192.0.2.112',
          )
        ).status,
      ).toBe(401);
      const res = await post(
        '/auth/2fa/enroll',
        { email: staff.email, password: STAFF_PASSWORD },
        '192.0.2.113',
      );
      expect(res.status).toBe(200);
      secret = res.body.secret as string;
      secrets.add(secret);
      expect(res.body.otpauth_uri).toContain(`secret=${secret}`);
      // At rest the secret is encrypted.
      expect(dump()).not.toContain(secret);
      expect(
        psql(db.url, `SELECT totp_secret_enc FROM user_credentials WHERE user_id = '${staff.id}'`),
      ).toMatch(/^v1\./);
    });

    it('turns the second factor on with a right code and then needs it every time', async () => {
      const bad = await post(
        '/auth/2fa/confirm',
        { email: staff.email, password: STAFF_PASSWORD, totp_code: '000000' },
        '192.0.2.114',
      );
      expect(bad.body.code).toBe('SECOND_FACTOR_INVALID');
      const good = code(secret);
      secrets.add(good);
      const ok = await post(
        '/auth/2fa/confirm',
        { email: staff.email, password: STAFF_PASSWORD, totp_code: good },
        '192.0.2.114',
      );
      expect(ok.status).toBe(200);
      expect(
        [401, 403].includes(
          (await http().get(adminUrlPath).set('Authorization', `Bearer ${ok.body.access_token}`))
            .status,
        ),
      ).toBe(false);

      // Without the code: refused. With the code just used: refused (no replay). Next step: in.
      const none = await login(staff.email, STAFF_PASSWORD, {}, '192.0.2.115');
      expect(none.body).toMatchObject({
        code: 'SECOND_FACTOR_REQUIRED',
        details: { enrollment_required: false },
      });
      const replay = await login(staff.email, STAFF_PASSWORD, { totp_code: good }, '192.0.2.116');
      expect(replay.body.code).toBe('SECOND_FACTOR_INVALID');
      ctx.clock.advanceSeconds(30);
      const next = code(secret);
      secrets.add(next);
      const again = await login(staff.email, STAFF_PASSWORD, { totp_code: next }, '192.0.2.117');
      expect(again.status).toBe(200);
      // Confirmed: enrolling again would let a password thief swap the authenticator.
      expect(
        (
          await post(
            '/auth/2fa/enroll',
            { email: staff.email, password: STAFF_PASSWORD },
            '192.0.2.118',
          )
        ).status,
      ).toBe(409);
    });

    it('counts wrong codes toward the lock-out', async () => {
      for (let i = 0; i < 5; i++) {
        await login(staff.email, STAFF_PASSWORD, { totp_code: '111111' }, '192.0.2.119');
      }
      expect((await login(staff.email, STAFF_PASSWORD, {}, '192.0.2.120')).status).toBe(429);
      ctx.clock.advanceSeconds(901);
    });
  });

  it('puts a password that arrives in a badly formed request nowhere: not in the answer, not in the log', async () => {
    const leaky = 'frase-que-no-debe-aparecer-jamas';
    secrets.add(leaky);
    const res = await post('/auth/login', { email: owner.email, password: leaky, extra: leaky });
    expect(res.status).toBe(400);
    const res2 = await post('/auth/password/reset', { token: 't', new_password: leaky, x: 1 });
    expect(res2.status).toBe(400);
  });

  it('writes audit entries for logins, failures, resets and changes, without any secret', async () => {
    const actions = psql(db.url, 'SELECT DISTINCT action FROM audit_log ORDER BY 1').split('\n');
    expect(actions).toEqual(
      expect.arrayContaining([
        'auth.login_failed',
        'auth.login_locked',
        'auth.login_succeeded',
        'auth.password_changed',
        'auth.password_rehashed',
        'auth.password_reset_completed',
        'auth.password_reset_requested',
        'auth.second_factor_enrolled',
        'auth.second_factor_failed',
      ]),
    );
    // Invented emails are recorded as probing, with no user and no address.
    expect(
      psql(
        db.url,
        "SELECT count(*) FROM audit_log WHERE action = 'auth.login_failed' AND actor_user_id IS NULL AND reason = 'unknown_account'",
      ),
    ).not.toBe('0');
    const audit = psql(db.url, 'SELECT row_to_json(a) FROM audit_log a');
    for (const email of [owner.email, staff.email, 'nadie@club.test'])
      expect(audit).not.toContain(email);
    for (const secret of secrets) expect(audit).not.toContain(secret);
  });

  it('keeps WhatsApp codes only as an HMAC, for 5 minutes and 5 attempts', async () => {
    const phone = '+5491155559999';
    ctx.clock.advanceSeconds(61);
    expect((await post('/auth/otp/whatsapp', { phone })).status).toBe(202);
    const code = /\b(\d{6})\b/.exec(ctx.whatsapp.sent.at(-1)?.body ?? '')?.[1] ?? '';
    const record = await ctx.moduleRef.get<OtpStore>(OTP_STORE).get(phone);
    expect(record?.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(record)).not.toContain(code);
    expect((record?.expiresAt ?? 0) - (record?.issuedAt ?? 0)).toBe(300_000);
    const wrong = code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) await post('/auth/otp/verify', { phone, code: wrong });
    const late = await post('/auth/otp/verify', { phone, code });
    expect(late.body.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    // The code is never written to the logs either (the dev provider prints it; tests use a fake).
    expect(JSON.stringify(ctx.logs())).not.toContain(`"${code}"`);
    expect(JSON.stringify(ctx.logs())).not.toContain(`es ${code}.`);
  });

  it('leaks no secret to the logs, the answers or the database', () => {
    const logs = JSON.stringify(ctx.logs());
    const everything = [logs, bodies.join('\n'), dump()];
    for (const secret of secrets) {
      expect(secret.length).toBeGreaterThan(5);
      expect(logs, `log contains ${secret.slice(0, 4)}…`).not.toContain(secret);
      // The authenticator secret is shown once to the person enrolling: it is the only secret an
      // answer may carry.
      if (!/^[A-Z2-7]{32}$/.test(secret)) expect(everything[1]).not.toContain(secret);
      expect(everything[2]).not.toContain(secret);
    }
    for (const line of ctx.logs()) {
      expect(JSON.stringify(line)).not.toMatch(
        /"(password|new_password|current_password|totp_code|token)":"(?!\[redacted\])/,
      );
    }
  });
});
