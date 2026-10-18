import { describe, expect, it } from 'vitest';
import {
  EventInProgressError,
  idempotencyKey,
  MemoryIdempotencyStore,
  runOnce,
} from '../../src/events/idempotency';

describe('runOnce', () => {
  const key = idempotencyKey('send-confirmation', '0192a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b');

  it('builds the key from consumer and event_id', () => {
    expect(key).toBe('events:processed:send-confirmation:0192a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b');
  });

  it('runs the effect once for the same key', async () => {
    const store = new MemoryIdempotencyStore();
    let effects = 0;
    const effect = () => {
      effects += 1;
      return Promise.resolve();
    };
    expect(await runOnce(store, key, effect)).toBe(true);
    expect(await runOnce(store, key, effect)).toBe(false);
    expect(effects).toBe(1);
    expect(store.entries.get(key)).toBe('done');
  });

  it('runs again for another consumer of the same event', async () => {
    const store = new MemoryIdempotencyStore();
    let effects = 0;
    const effect = () => {
      effects += 1;
      return Promise.resolve();
    };
    await runOnce(store, key, effect);
    await runOnce(store, idempotencyKey('other', 'x'), effect);
    expect(effects).toBe(2);
  });

  it('releases the lock when the effect fails, so a retry runs it', async () => {
    const store = new MemoryIdempotencyStore();
    await expect(runOnce(store, key, () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    expect(store.entries.has(key)).toBe(false);
    let effects = 0;
    expect(
      await runOnce(store, key, () => {
        effects += 1;
        return Promise.resolve();
      }),
    ).toBe(true);
    expect(effects).toBe(1);
  });

  it('refuses to run while another attempt holds the lock', async () => {
    const store = new MemoryIdempotencyStore();
    store.entries.set(key, 'processing');
    await expect(runOnce(store, key, () => Promise.resolve())).rejects.toBeInstanceOf(
      EventInProgressError,
    );
  });
});
