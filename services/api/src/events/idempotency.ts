import type { Redis } from 'ioredis';

/**
 * Remembers which (consumer, event_id) pairs already produced their effect.
 *
 * A pair goes through two states: `processing` (a short lock while the handler runs) and `done`
 * (kept for the retention TTL). A failed handler releases the lock so a retry can run it again.
 */
export interface IdempotencyStore {
  /** Atomically takes the lock. Returns the state found if the pair was already taken. */
  claim(key: string, lockTtlSeconds: number): Promise<'claimed' | 'processing' | 'done'>;
  markDone(key: string, ttlSeconds: number): Promise<void>;
  release(key: string): Promise<void>;
}

export interface IdempotencyOptions {
  /** How long a processed event_id is remembered. Default 7 days. */
  ttlSeconds: number;
  /** How long a running handler holds the lock before another attempt may take it. */
  lockTtlSeconds: number;
}

export const DEFAULT_IDEMPOTENCY: IdempotencyOptions = {
  ttlSeconds: 7 * 24 * 60 * 60,
  lockTtlSeconds: 5 * 60,
};

/** Another attempt is running the same consumer for the same event; retry later. */
export class EventInProgressError extends Error {
  constructor(readonly key: string) {
    super(`Event already being processed: ${key}`);
    this.name = 'EventInProgressError';
  }
}

export function idempotencyKey(consumer: string, eventId: string): string {
  return `events:processed:${consumer}:${eventId}`;
}

/**
 * Runs `effect` at most once per key. Returns `false` when it was skipped because it already
 * ran. Throws `EventInProgressError` when another attempt holds the lock, and rethrows the
 * effect's error after releasing the lock so the queue retries it.
 */
export async function runOnce(
  store: IdempotencyStore,
  key: string,
  effect: () => Promise<void>,
  options: IdempotencyOptions = DEFAULT_IDEMPOTENCY,
): Promise<boolean> {
  const state = await store.claim(key, options.lockTtlSeconds);
  if (state === 'done') return false;
  if (state === 'processing') throw new EventInProgressError(key);
  try {
    await effect();
  } catch (error) {
    await store.release(key);
    throw error;
  }
  await store.markDone(key, options.ttlSeconds);
  return true;
}

/** Redis implementation: `SET key processing NX EX`, then `SET key done EX`. */
export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(private readonly redis: Redis) {}

  async claim(key: string, lockTtlSeconds: number): Promise<'claimed' | 'processing' | 'done'> {
    const result = await this.redis.set(key, 'processing', 'EX', lockTtlSeconds, 'NX');
    if (result === 'OK') return 'claimed';
    const current = await this.redis.get(key);
    // The key may expire between the two calls; treat that as in progress and retry.
    return current === 'done' ? 'done' : 'processing';
  }

  async markDone(key: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, 'done', 'EX', ttlSeconds);
  }

  async release(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

/** In-memory implementation for unit tests. TTLs are ignored. */
export class MemoryIdempotencyStore implements IdempotencyStore {
  readonly entries = new Map<string, 'processing' | 'done'>();

  claim(key: string): Promise<'claimed' | 'processing' | 'done'> {
    const current = this.entries.get(key);
    if (current) return Promise.resolve(current);
    this.entries.set(key, 'processing');
    return Promise.resolve('claimed');
  }

  markDone(key: string): Promise<void> {
    this.entries.set(key, 'done');
    return Promise.resolve();
  }

  release(key: string): Promise<void> {
    this.entries.delete(key);
    return Promise.resolve();
  }
}
