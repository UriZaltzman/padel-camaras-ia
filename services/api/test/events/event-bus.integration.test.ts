import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEAD_LETTER_QUEUE, EventBus, EVENTS_QUEUE } from '../../src/events/event-bus';
import { DEFAULT_IDEMPOTENCY } from '../../src/events/idempotency';
import { memoryLogger } from '../helpers';
import { available, startRedis, type RedisTarget } from '../redis-target';
import { bookingConfirmed } from './fixtures';

function waitFor(check: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await check()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('timed out'));
      setTimeout(() => void tick(), 50);
    };
    void tick();
  });
}

describe.skipIf(!available)('EventBus on a real Redis', () => {
  let target: RedisTarget;
  let admin: Redis;

  beforeAll(async () => {
    target = await startRedis();
    admin = new Redis(target.url, { maxRetriesPerRequest: null });
    await admin.flushdb();
  }, 120_000);

  afterAll(async () => {
    await admin?.quit();
    await target?.stop();
  });

  function makeBus(attempts = 3) {
    const log = memoryLogger();
    const bus = new EventBus(new Redis(target.url, { maxRetriesPerRequest: null }), log.logger, {
      attempts,
      backoffMs: 10,
      concurrency: 5,
      idempotency: { ...DEFAULT_IDEMPOTENCY, lockTtlSeconds: 5 },
    });
    return { bus, log };
  }

  it('processes the same event_id twice with a single effect', async () => {
    const { bus, log } = makeBus();
    const effects: string[] = [];
    bus.subscribe('booking.confirmed', 'count-effects', (event) => {
      effects.push(event.event_id);
      return Promise.resolve();
    });
    bus.start();
    const event = bookingConfirmed('0192a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a01');

    await bus.publish(event);
    await waitFor(() => Promise.resolve(effects.length === 1));

    // Redelivery that bypasses BullMQ's job-id dedupe (e.g. a producer retry after the job
    // was removed): enqueue the same event under another job id.
    const queue = new Queue(EVENTS_QUEUE, { connection: admin });
    await queue.add(event.event_type, event, { jobId: 'redelivery-1' });
    await waitFor(async () => (await queue.getJobState('redelivery-1')) === 'completed');
    await queue.close();

    expect(effects).toEqual([event.event_id]);
    const lines = log.lines();
    expect(lines.some((l) => l.msg === 'event already consumed, skipped')).toBe(true);
    // Logs identify the event but never carry the payload.
    expect(JSON.stringify(lines)).not.toContain(event.payload.organizer_user_id);
    expect(lines.every((l) => l.payload === undefined)).toBe(true);
    await bus.close();
  });

  it('retries a failing consumer with backoff without repeating the ones that succeeded', async () => {
    const { bus } = makeBus();
    let okRuns = 0;
    let flakyRuns = 0;
    bus.subscribe('booking.confirmed', 'ok', () => {
      okRuns += 1;
      return Promise.resolve();
    });
    bus.subscribe('booking.confirmed', 'flaky', () => {
      flakyRuns += 1;
      return flakyRuns < 2 ? Promise.reject(new Error('temporary')) : Promise.resolve();
    });
    bus.start();
    await bus.publish(bookingConfirmed('0192a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a02'));
    await waitFor(() => Promise.resolve(flakyRuns === 2));
    await new Promise((r) => setTimeout(r, 200));
    expect(okRuns).toBe(1);
    await bus.close();
  });

  it('moves an event to the dead-letter queue after the last attempt', async () => {
    const { bus } = makeBus(2);
    bus.subscribe('booking.confirmed', 'always-fails', () => Promise.reject(new Error('down')));
    bus.start();
    const event = bookingConfirmed('0192a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a03');
    await bus.publish(event);
    const dlq = new Queue(DEAD_LETTER_QUEUE, { connection: admin });
    await waitFor(async () => (await dlq.getJob(event.event_id)) !== undefined);
    const letter = await dlq.getJob(event.event_id);
    expect(letter?.data).toMatchObject({ event: { event_id: event.event_id }, attempts_made: 2 });
    await dlq.close();
    await bus.close();
  });

  it('refuses to publish an invalid event', async () => {
    const { bus } = makeBus();
    await expect(
      bus.publish({ ...bookingConfirmed(), event_id: 'not-a-uuid' } as never),
    ).rejects.toThrow('Invalid event');
    await bus.close();
  });

  it('sends an invalid event found in the queue straight to the dead-letter queue', async () => {
    const { bus } = makeBus(5);
    bus.subscribe('booking.confirmed', 'never-called', () => Promise.reject(new Error('called')));
    bus.start();
    const queue = new Queue(EVENTS_QUEUE, { connection: admin });
    await queue.add(
      'booking.confirmed',
      { event_type: 'booking.confirmed' },
      { jobId: 'bad-1', attempts: 5 },
    );
    const dlq = new Queue(DEAD_LETTER_QUEUE, { connection: admin });
    await waitFor(async () => (await dlq.getJob('bad-1')) !== undefined);
    expect((await dlq.getJob('bad-1'))?.data.attempts_made).toBe(1);
    await Promise.all([queue.close(), dlq.close()]);
    await bus.close();
  });
});
