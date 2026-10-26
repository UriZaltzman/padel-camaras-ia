import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSeed } from '../../src/seed/run';
import { DEFAULT_SEED_PASSWORD } from '../../src/seed/credentials';
import { adminUrl, createScratchDb } from '../db/scratch-db';
import { createTestApp } from '../helpers';

// The seed hook (#347 left it, #343 fills it): seeded owners sign in through the real login.
describe.skipIf(!adminUrl)('seeded logins', () => {
  const db = adminUrl ? createScratchDb('seedlogin') : { url: '', drop: () => undefined };
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    await runSeed({ NODE_ENV: 'development', DATABASE_URL: db.url }, () => undefined);
    // Running it again changes nothing.
    await runSeed({ NODE_ENV: 'development', DATABASE_URL: db.url }, () => undefined);
    ctx = await createTestApp([], { databaseUrl: db.url });
  }, 120_000);
  afterAll(async () => {
    await ctx.app.close();
    db.drop();
  });

  it('lets the seeded owner and receptionist in, and nobody with another password', async () => {
    const http = () => request(ctx.app.getHttpServer());
    for (const email of ['owner.palermo@example.com', 'staff.pilar@example.com']) {
      const ok = await http()
        .post('/v1/auth/login')
        .send({ email, password: DEFAULT_SEED_PASSWORD });
      expect(ok.status).toBe(200);
      expect(ok.body.user.email).toBe(email);
    }
    const bad = await http()
      .post('/v1/auth/login')
      .send({ email: 'owner.palermo@example.com', password: 'otra frase larga equivocada' });
    expect(bad.status).toBe(401);
  });
});
