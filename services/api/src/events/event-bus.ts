import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { DomainEvent, EventOf, EventType } from '@app/contracts';
import { EventValidator, InvalidEventError } from './event-validator';
import {
  DEFAULT_IDEMPOTENCY,
  idempotencyKey,
  RedisIdempotencyStore,
  runOnce,
  type IdempotencyOptions,
  type IdempotencyStore,
} from './idempotency';

export const EVENTS_QUEUE = 'domain-events';
export const DEAD_LETTER_QUEUE = 'domain-events-dlq';

export type EventHandler<T extends EventType> = (event: EventOf<T>) => Promise<void>;

interface Consumer {
  /** Stable name; part of the idempotency key, so renaming it reprocesses events. */
  name: string;
  handle: (event: DomainEvent) => Promise<void>;
}

export interface EventBusOptions {
  /** Attempts per job, including the first. Default 5. */
  attempts: number;
  /** Base delay of the exponential backoff, in ms. Default 1000. */
  backoffMs: number;
  concurrency: number;
  idempotency: IdempotencyOptions;
}

export const DEFAULT_EVENT_BUS_OPTIONS: EventBusOptions = {
  attempts: 5,
  backoffMs: 1_000,
  concurrency: 10,
  idempotency: DEFAULT_IDEMPOTENCY,
};

/** What lands in the dead-letter queue: the event plus why it failed (no stack, no payload copy). */
export interface DeadLetter {
  event: unknown;
  failed_reason: string;
  attempts_made: number;
}

/**
 * Domain events of section 11 over BullMQ. Every event is validated against its contract schema
 * before publishing and again before any consumer sees it. Each consumer runs at most once per
 * `event_id` (idempotency key in Redis with a TTL), so a repeated event has a single effect.
 * Failed jobs retry with exponential backoff; after the last attempt they go to the DLQ.
 * Logs carry `event_id`, `event_type` and the consumer name, never the payload.
 */
export class EventBus {
  private readonly queue: Queue;
  private readonly deadLetters: Queue;
  private readonly consumers = new Map<EventType, Consumer[]>();
  private readonly store: IdempotencyStore;
  private worker: Worker | undefined;

  constructor(
    private readonly connection: Redis,
    private readonly logger: Logger,
    private readonly options: EventBusOptions = DEFAULT_EVENT_BUS_OPTIONS,
    private readonly validator: EventValidator = new EventValidator(),
    store?: IdempotencyStore,
  ) {
    this.queue = new Queue(EVENTS_QUEUE, { connection });
    this.deadLetters = new Queue(DEAD_LETTER_QUEUE, { connection });
    this.store = store ?? new RedisIdempotencyStore(connection);
  }

  /** Validates and enqueues an event. The job id is the event_id, so BullMQ drops duplicates. */
  async publish<T extends EventType>(event: EventOf<T>): Promise<void> {
    const valid = this.validator.validate(event);
    await this.queue.add(valid.event_type, valid, {
      jobId: valid.event_id,
      attempts: this.options.attempts,
      backoff: { type: 'exponential', delay: this.options.backoffMs },
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 1_000 },
    });
    this.logger.info({ event_id: valid.event_id, event_type: valid.event_type }, 'event published');
  }

  /** Registers a consumer for one event type. Call before `start()`. */
  subscribe<T extends EventType>(type: T, name: string, handler: EventHandler<T>): void {
    const list = this.consumers.get(type) ?? [];
    if (list.some((c) => c.name === name)) {
      throw new Error(`Consumer ${name} is already subscribed to ${type}`);
    }
    list.push({ name, handle: handler as (event: DomainEvent) => Promise<void> });
    this.consumers.set(type, list);
  }

  /** Starts consuming. Workers need their own connection, which BullMQ duplicates from ours. */
  start(): void {
    if (this.worker) return;
    this.worker = new Worker(EVENTS_QUEUE, (job) => this.process(job), {
      connection: this.connection,
      concurrency: this.options.concurrency,
    });
    this.worker.on('failed', (job, error) => {
      void this.onFailed(job, error);
    });
    this.worker.on('error', (error) => {
      this.logger.error({ err: { message: error.message } }, 'event worker error');
    });
  }

  /** Runs every consumer of the event's type, each at most once per event_id. */
  async process(job: Pick<Job, 'data' | 'attemptsMade'>): Promise<void> {
    let event: DomainEvent;
    try {
      event = this.validator.validate(job.data);
    } catch (error) {
      // An invalid event never becomes valid: skip the retries and go straight to the DLQ.
      if (error instanceof InvalidEventError) throw new UnrecoverableError(error.message);
      throw error;
    }
    const consumers = this.consumers.get(event.event_type) ?? [];
    const context = { event_id: event.event_id, event_type: event.event_type };
    // Every consumer is attempted; any failure fails the job so the failed ones retry.
    // Consumers that already succeeded are skipped on the retry by their idempotency key.
    const errors: unknown[] = [];
    for (const consumer of consumers) {
      try {
        const ran = await runOnce(
          this.store,
          idempotencyKey(consumer.name, event.event_id),
          () => consumer.handle(event),
          this.options.idempotency,
        );
        this.logger.info(
          { ...context, consumer: consumer.name, attempt: job.attemptsMade + 1 },
          ran ? 'event consumed' : 'event already consumed, skipped',
        );
      } catch (error) {
        this.logger.warn(
          {
            ...context,
            consumer: consumer.name,
            attempt: job.attemptsMade + 1,
            err: { message: error instanceof Error ? error.message : String(error) },
          },
          'event consumer failed',
        );
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new Error(`${errors.length} consumer(s) failed for ${event.event_type}`);
    }
  }

  private async onFailed(job: Job | undefined, error: Error): Promise<void> {
    if (!job) return;
    const unrecoverable = error instanceof UnrecoverableError;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!unrecoverable && !exhausted) return;
    const letter: DeadLetter = {
      event: job.data,
      failed_reason: error.message,
      attempts_made: job.attemptsMade,
    };
    await this.deadLetters.add(job.name, letter, { jobId: job.id });
    this.logger.error(
      { event_id: job.id, event_type: job.name, attempts: job.attemptsMade },
      'event moved to dead-letter queue',
    );
  }

  /** Stops the worker and queues, then quits the connection: the bus owns it. */
  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.deadLetters.close();
    await this.connection.quit();
  }
}
