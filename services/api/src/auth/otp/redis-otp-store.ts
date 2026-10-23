import type { Redis } from 'ioredis';
import type { OtpRecord, OtpStore } from './otp-store';

const key = (phone: string): string => `otp:${phone}`;

// HINCRBY on a missing key would create it without a TTL, so both scripts check first.
const ADD_ATTEMPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
return redis.call('HINCRBY', KEYS[1], 'attempts', 1)`;
const REFUND_ATTEMPT = `
if redis.call('EXISTS', KEYS[1]) == 1 and tonumber(redis.call('HGET', KEYS[1], 'attempts')) > 0 then
  return redis.call('HINCRBY', KEYS[1], 'attempts', -1)
end
return 0`;

/** Codes live in a Redis hash that expires on its own after the code's lifetime. */
export class RedisOtpStore implements OtpStore {
  constructor(private readonly redis: Redis) {}

  async get(phone: string): Promise<OtpRecord | null> {
    const hash = await this.redis.hgetall(key(phone));
    if (hash.codeHash === undefined) return null;
    return {
      codeHash: hash.codeHash,
      attempts: Number(hash.attempts),
      issuedAt: Number(hash.issuedAt),
      expiresAt: Number(hash.expiresAt),
    };
  }

  async put(phone: string, record: OtpRecord, ttlSeconds: number): Promise<void> {
    await this.redis
      .multi()
      .del(key(phone))
      .hset(key(phone), {
        codeHash: record.codeHash,
        attempts: record.attempts,
        issuedAt: record.issuedAt,
        expiresAt: record.expiresAt,
      })
      .expire(key(phone), ttlSeconds)
      .exec();
  }

  async addAttempt(phone: string): Promise<number | null> {
    const result = Number(await this.redis.eval(ADD_ATTEMPT, 1, key(phone)));
    return result < 0 ? null : result;
  }

  async refundAttempt(phone: string): Promise<void> {
    await this.redis.eval(REFUND_ATTEMPT, 1, key(phone));
  }

  async remove(phone: string): Promise<boolean> {
    return (await this.redis.del(key(phone))) === 1;
  }
}
