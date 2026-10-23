import type { Redis } from 'ioredis';
import type { RefreshRecord, SessionStore } from './session-store';

const tokenKey = (id: string): string => `rt:${id}`;
const familyKey = (id: string): string => `rt-revoked:${id}`;

// Reads the token and flips `used` in one step, so two parallel refreshes cannot both win.
const MARK_USED = `
if redis.call('EXISTS', KEYS[1]) == 0 then return false end
local data = redis.call('HGETALL', KEYS[1])
redis.call('HSET', KEYS[1], 'used', '1')
return data`;

export class RedisSessionStore implements SessionStore {
  constructor(private readonly redis: Redis) {}

  async save(record: RefreshRecord, ttlSeconds: number): Promise<void> {
    await this.redis
      .multi()
      .hset(tokenKey(record.id), {
        secretHash: record.secretHash,
        userId: record.userId,
        familyId: record.familyId,
        used: record.used ? '1' : '0',
      })
      .expire(tokenKey(record.id), ttlSeconds)
      .exec();
  }

  async markUsed(id: string): Promise<RefreshRecord | null> {
    const flat = (await this.redis.eval(MARK_USED, 1, tokenKey(id))) as string[] | null;
    if (!flat) return null;
    const hash: Record<string, string> = {};
    for (let i = 0; i < flat.length; i += 2) hash[flat[i] as string] = flat[i + 1] as string;
    return {
      id,
      secretHash: hash.secretHash ?? '',
      userId: hash.userId ?? '',
      familyId: hash.familyId ?? '',
      used: hash.used === '1',
    };
  }

  async revokeFamily(familyId: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(familyKey(familyId), '1', 'EX', ttlSeconds);
  }

  async isFamilyRevoked(familyId: string): Promise<boolean> {
    return (await this.redis.exists(familyKey(familyId))) === 1;
  }
}
