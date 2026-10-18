import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_TYPES } from '@app/contracts';
import { describe, expect, it } from 'vitest';
import { EventValidator, InvalidEventError } from '../../src/events/event-validator';
import { bookingConfirmed } from './fixtures';

const validator = new EventValidator();
const eventsDir = fileURLToPath(new URL('../../../../packages/contracts/events', import.meta.url));

function catchInvalid(event: unknown): InvalidEventError {
  try {
    validator.validate(event);
  } catch (error) {
    if (error instanceof InvalidEventError) return error;
    throw error;
  }
  throw new Error('expected InvalidEventError');
}

describe('EventValidator', () => {
  it('has a schema for every event type of the contract', () => {
    expect(validator.knownTypes().sort()).toEqual([...EVENT_TYPES].sort());
  });

  it('accepts the example of every event schema', () => {
    const files = readdirSync(eventsDir).filter(
      (f) => f.endsWith('.schema.json') && f !== 'common.schema.json',
    );
    expect(files).toHaveLength(EVENT_TYPES.length);
    for (const file of files) {
      const schema = JSON.parse(readFileSync(join(eventsDir, file), 'utf8')) as {
        examples: unknown[];
      };
      for (const example of schema.examples) {
        expect(() => validator.validate(example), file).not.toThrow();
      }
    }
  });

  it('rejects an unknown event type', () => {
    const error = catchInvalid({ ...bookingConfirmed(), event_type: 'booking.exploded' });
    expect(error.issues).toEqual([{ path: '/event_type', message: 'is not a known event type' }]);
  });

  it('rejects something that is not an object', () => {
    expect(catchInvalid('hola').eventType).toBeUndefined();
  });

  it('rejects an event_id that is not a UUID v7', () => {
    const error = catchInvalid({ ...bookingConfirmed(), event_id: 'abc' });
    expect(error.issues.map((i) => i.path)).toContain('/event_id');
  });

  it('rejects a local timestamp and a missing payload field', () => {
    const event = bookingConfirmed();
    const payload: Partial<typeof event.payload> = { ...event.payload };
    delete payload.court_id;
    const error = catchInvalid({ ...event, occurred_at: '2026-10-20T20:30:00-03:00', payload });
    const paths = error.issues.map((i) => i.path);
    expect(paths).toContain('/occurred_at');
    expect(paths).toContain('/payload');
    expect(error.eventType).toBe('booking.confirmed');
  });

  it('rejects extra fields and a wrong schema_version', () => {
    const error = catchInvalid({ ...bookingConfirmed(), schema_version: 2, extra: true });
    expect(error.issues.length).toBeGreaterThanOrEqual(2);
  });

  it('never puts field values in the error message', () => {
    const event = bookingConfirmed();
    const secret = 'Juan Perez 1155554444';
    const error = catchInvalid({ ...event, payload: { ...event.payload, club_id: secret } });
    expect(error.message).not.toContain(secret);
    expect(error.message).toContain(event.event_id);
  });
});
