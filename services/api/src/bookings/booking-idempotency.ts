import type { Redis } from 'ioredis';

export const BOOKING_IDEMPOTENCY = Symbol('BOOKING_IDEMPOTENCY');
const TTL_SECONDS = 24 * 60 * 60;

/** Remembers which booking an `Idempotency-Key` produced, per user, so a retry returns it. */
export interface BookingIdempotency {
  find(userId: string, key: string): Promise<string | null>;
  remember(userId: string, key: string, bookingId: string): Promise<void>;
}

export class RedisBookingIdempotency implements BookingIdempotency {
  constructor(private readonly redis: Redis) {}
  private k(userId: string, key: string): string {
    return `idem:booking:${userId}:${key}`;
  }
  find(userId: string, key: string): Promise<string | null> {
    return this.redis.get(this.k(userId, key));
  }
  async remember(userId: string, key: string, bookingId: string): Promise<void> {
    await this.redis.set(this.k(userId, key), bookingId, 'EX', TTL_SECONDS);
  }
}

export class InMemoryBookingIdempotency implements BookingIdempotency {
  private readonly map = new Map<string, string>();
  find(userId: string, key: string): Promise<string | null> {
    return Promise.resolve(this.map.get(`${userId}:${key}`) ?? null);
  }
  remember(userId: string, key: string, bookingId: string): Promise<void> {
    this.map.set(`${userId}:${key}`, bookingId);
    return Promise.resolve();
  }
}
