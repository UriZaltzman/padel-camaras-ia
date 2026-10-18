// Domain event schemas of section 11: the 12 events exist, every schema validates its own
// example, the envelope (event_id, occurred_at, schema_version) is enforced, and the generated
// TypeScript types match the schemas.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { generateEventsTs, loadEventSchemas, TS_EVENTS_OUTPUT } from '../scripts/events.mjs';

/** Section 11 of the specification, transcribed. */
const SECTION_11 = [
  'booking.confirmed',
  'booking.cancelled',
  'match.recording_started',
  'match.recorded',
  'match.processed',
  'match.published',
  'match.score_corrected',
  'clip.created',
  'payment.approved',
  'payment.refunded',
  'device.offline',
  'settlement.ready',
];

const ENVELOPE = ['event_id', 'event_type', 'occurred_at', 'schema_version', 'payload'];

const { common, events } = await loadEventSchemas();
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(common);
const validators = new Map(events.map((e) => [e.type, ajv.compile(e.schema)]));

const example = (type) =>
  JSON.parse(JSON.stringify(events.find((e) => e.type === type).schema.examples[0]));
const isValid = (type, value) => validators.get(type)(value);

test('there is exactly one schema per event of section 11', () => {
  assert.deepEqual(events.map((e) => e.type).sort(), [...SECTION_11].sort());
});

describe('every event schema', () => {
  for (const { type, schema } of events) {
    test(`${type} validates its example`, () => {
      assert.equal(schema.examples?.length, 1);
      const validate = validators.get(type);
      assert.ok(validate(schema.examples[0]), JSON.stringify(validate.errors));
    });

    test(`${type} requires the envelope fields`, () => {
      assert.deepEqual(schema.required, ENVELOPE);
      for (const field of ENVELOPE) {
        const value = Object.fromEntries(
          Object.entries(example(type)).filter(([key]) => key !== field),
        );
        assert.equal(isValid(type, value), false, `missing ${field} must be rejected`);
      }
    });

    test(`${type} rejects a non-v7 event_id, a non-UTC occurred_at and an unknown version`, () => {
      const v4 = { ...example(type), event_id: '9b2e4c1a-3f5d-4e6a-8b7c-1d2e3f4a5b6c' };
      assert.equal(isValid(type, v4), false);
      const local = { ...example(type), occurred_at: '2026-10-20T20:30:00-03:00' };
      assert.equal(isValid(type, local), false);
      assert.equal(isValid(type, { ...example(type), schema_version: 2 }), false);
      assert.equal(isValid(type, { ...example(type), event_type: 'other.event' }), false);
      assert.equal(isValid(type, { ...example(type), extra: true }), false);
    });
  }
});

test('status fields use the state-machine enums of the contract', () => {
  const statusDefs = ['MatchStatus', 'BookingStatus', 'PaymentStatus', 'SettlementStatus'];
  for (const { type, schema } of events) {
    const status = schema.properties.payload.properties.status;
    if (!status) continue;
    const def = status.allOf?.[0]?.$ref?.split('/').pop();
    assert.ok(statusDefs.includes(def), `${type}: status must reference a status enum`);
    assert.ok(common.$defs[def].enum.includes(status.const), `${type}: ${status.const}`);
  }
});

test('generated/typescript/events.ts is up to date and exports a type per event', async () => {
  const committed = await readFile(TS_EVENTS_OUTPUT, 'utf8');
  assert.equal(committed, await generateEventsTs({ common, events }));
  for (const { title } of events) {
    assert.match(committed, new RegExp(`^export type ${title} = `, 'm'), title);
  }
  for (const type of SECTION_11) assert.ok(committed.includes(`'${type}'`), type);
});
