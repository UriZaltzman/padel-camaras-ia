import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisOtpStore } from '../../src/auth/otp/redis-otp-store';
import { RedisSessionStore } from '../../src/auth/session/redis-session-store';
import { available, SKIP_REASON, startRedis, type RedisTarget } from '../redis-target';

// The production stores against a real Redis (the unit tests use the in-memory ones).
describe.skipIf(!available)(`Redis stores (${SKIP_REASON})`, () => {
  let target: RedisTarget;
  let redis: Redis;

  beforeAll(async () => {
    target = await startRedis();
    redis = new Redis(target.url);
  }, 120_000);

  afterAll(async () => {
    await redis?.quit();
    await target?.stop();
  });

  const record = { codeHash: 'ab'.repeat(32), attempts: 0, issuedAt: 1000, expiresAt: 301_000 };

  it('keeps an OTP with a TTL and counts attempts atomically', async () => {
    const store = new RedisOtpStore(redis);
    await store.put('+5491100000001', record, 300);
    expect(await redis.ttl('otp:+5491100000001')).toBeGreaterThan(290);
    expect(await store.get('+5491100000001')).toEqual(record);

    const counts = await Promise.all([1, 2, 3, 4, 5].map(() => store.addAttempt('+5491100000001')));
    expect([...counts].sort()).toEqual([1, 2, 3, 4, 5]);
    await store.refundAttempt('+5491100000001');
    expect((await store.get('+5491100000001'))?.attempts).toBe(4);
  });

  it('does not create a record (without TTL) when counting an attempt on a missing code', async () => {
    const store = new RedisOtpStore(redis);
    expect(await store.addAttempt('+5491100000002')).toBeNull();
    await store.refundAttempt('+5491100000002');
    expect(await redis.exists('otp:+5491100000002')).toBe(0);
    expect(await store.get('+5491100000002')).toBeNull();
  });

  it('removes an OTP for exactly one of two parallel callers', async () => {
    const store = new RedisOtpStore(redis);
    await store.put('+5491100000003', record, 300);
    const results = await Promise.all([
      store.remove('+5491100000003'),
      store.remove('+5491100000003'),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('marks a refresh token used once and reports it as used afterwards', async () => {
    const store = new RedisSessionStore(redis);
    await store.save(
      { id: 't1', secretHash: 'h', userId: 'u', familyId: 'f', used: false, epoch: 0, mfa: false },
      60,
    );
    expect(await redis.ttl('rt:t1')).toBeGreaterThan(50);
    const [a, b] = await Promise.all([store.markUsed('t1'), store.markUsed('t1')]);
    expect([a?.used, b?.used].sort()).toEqual([false, true]);
    expect(a).toMatchObject({ id: 't1', secretHash: 'h', userId: 'u', familyId: 'f' });
    expect(await store.markUsed('missing')).toBeNull();
  });

  it('remembers a revoked family', async () => {
    const store = new RedisSessionStore(redis);
    expect(await store.isFamilyRevoked('fam')).toBe(false);
    await store.revokeFamily('fam', 60);
    expect(await store.isFamilyRevoked('fam')).toBe(true);
  });
});
