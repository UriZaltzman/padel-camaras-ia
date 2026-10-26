import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';

/** Failures counted in a rolling window, and how long a lock lasts once the limit is hit. */
export interface ThrottlePolicy {
  maxFailures: number;
  windowSeconds: number;
  lockSeconds: number;
}

/** Per account (by the typed email, whether or not it exists) and per IP address. */
export const ACCOUNT_POLICY: ThrottlePolicy = {
  maxFailures: 5,
  windowSeconds: 900,
  lockSeconds: 900,
};
export const IP_POLICY: ThrottlePolicy = { maxFailures: 30, windowSeconds: 900, lockSeconds: 900 };
/** Reset links asked per email and per IP: more are silently ignored (the answer never changes). */
export const RESET_REQUEST_POLICY: ThrottlePolicy = {
  maxFailures: 5,
  windowSeconds: 3600,
  lockSeconds: 3600,
};

/** Counters of failed attempts. Keys are opaque (`throttleKey`), never an email or an address. */
export interface LoginThrottleStore {
  /** Milliseconds epoch until which the key is locked; 0 when it is not. */
  lockedUntil(key: string, nowMs: number): Promise<number>;
  /** Counts one failure; returns the lock expiry if this failure (or an earlier one) locks it. */
  recordFailure(key: string, policy: ThrottlePolicy, nowMs: number): Promise<number>;
  reset(key: string): Promise<void>;
}

export const LOGIN_THROTTLE = Symbol('LOGIN_THROTTLE');

/** `kind` + a digest of the subject: the store never holds a plain email or IP. */
export function throttleKey(
  kind: 'acct' | 'ip' | 'reset-acct' | 'reset-ip',
  subject: string,
): string {
  return `login:${kind}:${createHash('sha256').update(subject).digest('hex')}`;
}

export class InMemoryLoginThrottleStore implements LoginThrottleStore {
  private readonly entries = new Map<string, { failures: number[]; lockedUntil: number }>();

  lockedUntil(key: string, nowMs: number): Promise<number> {
    const until = this.entries.get(key)?.lockedUntil ?? 0;
    return Promise.resolve(until > nowMs ? until : 0);
  }

  recordFailure(key: string, policy: ThrottlePolicy, nowMs: number): Promise<number> {
    const entry = this.entries.get(key) ?? { failures: [], lockedUntil: 0 };
    entry.failures = entry.failures.filter((t) => t > nowMs - policy.windowSeconds * 1000);
    entry.failures.push(nowMs);
    if (entry.failures.length >= policy.maxFailures) {
      entry.lockedUntil = nowMs + policy.lockSeconds * 1000;
      entry.failures = [];
    }
    this.entries.set(key, entry);
    return Promise.resolve(entry.lockedUntil > nowMs ? entry.lockedUntil : 0);
  }

  reset(key: string): Promise<void> {
    this.entries.delete(key);
    return Promise.resolve();
  }
}

// One atomic step: count, lock at the limit, expire on its own. ARGV: window s, max, lock s, now ms.
const RECORD_FAILURE = `
local count = redis.call('HINCRBY', KEYS[1], 'count', 1)
if count == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
local lockedUntil = tonumber(redis.call('HGET', KEYS[1], 'lockedUntil') or '0')
if count >= tonumber(ARGV[2]) then
  lockedUntil = tonumber(ARGV[4]) + tonumber(ARGV[3]) * 1000
  redis.call('HSET', KEYS[1], 'lockedUntil', tostring(lockedUntil))
  redis.call('HSET', KEYS[1], 'count', '0')
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
end
if lockedUntil > tonumber(ARGV[4]) then return tostring(lockedUntil) end
return '0'`;

export class RedisLoginThrottleStore implements LoginThrottleStore {
  constructor(private readonly redis: Redis) {}

  async lockedUntil(key: string, nowMs: number): Promise<number> {
    const until = Number((await this.redis.hget(key, 'lockedUntil')) ?? 0);
    return until > nowMs ? until : 0;
  }

  async recordFailure(key: string, policy: ThrottlePolicy, nowMs: number): Promise<number> {
    const result = await this.redis.eval(
      RECORD_FAILURE,
      1,
      key,
      policy.windowSeconds,
      policy.maxFailures,
      policy.lockSeconds,
      nowMs,
    );
    return Number(result);
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
