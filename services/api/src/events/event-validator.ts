// Validates domain events against the JSON schemas of the contract with Ajv (MIT) in 2020-12
// mode and ajv-formats (MIT). Used before publishing and again when consuming.
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { EVENT_TYPES, type DomainEvent, type EventType } from '@app/contracts';
import { COMMON_SCHEMA, EVENT_SCHEMAS } from './event-schemas';

// ajv-formats is CommonJS; depending on the loader its default export arrives wrapped.
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ??
  addFormatsModule) as (ajv: Ajv2020) => Ajv2020;

export interface EventIssue {
  /** JSON pointer of the failing field, e.g. `/payload/club_id`. Never the value. */
  path: string;
  message: string;
}

/**
 * An event that does not match its schema. Carries only the event id/type (when readable) and
 * field paths, never values: payloads may hold personal data.
 */
export class InvalidEventError extends Error {
  constructor(
    readonly eventId: string | undefined,
    readonly eventType: string | undefined,
    readonly issues: readonly EventIssue[],
  ) {
    super(
      `Invalid event ${eventType ?? '<unknown type>'} ${eventId ?? '<no id>'}: ${issues
        .map((i) => `${i.path || '/'} ${i.message}`)
        .join('; ')}`,
    );
    this.name = 'InvalidEventError';
  }
}

export function isEventType(value: unknown): value is EventType {
  return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value);
}

function readString(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : undefined;
}

export class EventValidator {
  private readonly validators = new Map<string, ValidateFunction>();

  constructor() {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    ajv.addSchema(COMMON_SCHEMA);
    for (const schema of EVENT_SCHEMAS) {
      const validate = ajv.compile(schema);
      const type = (schema as { properties?: { event_type?: { const?: string } } }).properties
        ?.event_type?.const;
      if (type) this.validators.set(type, validate);
    }
  }

  /** Event types that have a compiled schema. */
  knownTypes(): string[] {
    return [...this.validators.keys()];
  }

  /** Returns the event typed, or throws `InvalidEventError`. */
  validate(event: unknown): DomainEvent {
    const eventId = readString(event, 'event_id');
    const eventType = readString(event, 'event_type');
    const validate = eventType === undefined ? undefined : this.validators.get(eventType);
    if (!validate) {
      throw new InvalidEventError(eventId, eventType, [
        { path: '/event_type', message: 'is not a known event type' },
      ]);
    }
    if (!validate(event)) {
      const issues = (validate.errors ?? []).map((error) => ({
        path: error.instancePath,
        message: error.message ?? 'is invalid',
      }));
      throw new InvalidEventError(eventId, eventType, issues);
    }
    return event as DomainEvent;
  }
}
