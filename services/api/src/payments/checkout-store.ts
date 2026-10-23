import type { Redis } from 'ioredis';
import type { Checkout } from './payments.model';

export const CHECKOUT_STORE = Symbol('CHECKOUT_STORE');

/** Remembers the checkout made for an `Idempotency-Key`, so a retry returns the same one. */
export interface CheckoutStore {
  get(key: string): Promise<Checkout | null>;
  /** Stores only if the key is free; returns false when another request got there first. */
  setIfAbsent(key: string, checkout: Checkout, ttlSeconds: number): Promise<boolean>;
}

export class InMemoryCheckoutStore implements CheckoutStore {
  private readonly items = new Map<string, Checkout>();
  get(key: string): Promise<Checkout | null> {
    return Promise.resolve(this.items.get(key) ?? null);
  }
  setIfAbsent(key: string, checkout: Checkout): Promise<boolean> {
    if (this.items.has(key)) return Promise.resolve(false);
    this.items.set(key, checkout);
    return Promise.resolve(true);
  }
}

export class RedisCheckoutStore implements CheckoutStore {
  constructor(private readonly redis: Redis) {}
  async get(key: string): Promise<Checkout | null> {
    const raw = await this.redis.get(`payments:checkout:${key}`);
    return raw === null ? null : (JSON.parse(raw) as Checkout);
  }
  async setIfAbsent(key: string, checkout: Checkout, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(
      `payments:checkout:${key}`,
      JSON.stringify(checkout),
      'EX',
      ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }
}
