// The exported transition tables must match section 3 of docs/especificacion-tecnica.md one by
// one, and agree with the status enums of the contract. SECTION_3 below is written from the
// specification on purpose, independently of the contract: it is the reference the generated
// tables are checked against, not a second source for them.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';

import ts from 'typescript';
import YAML from 'yaml';

import stateMachine from '../spectral/functions/stateMachine.js';
import {
  generateStateMachinesTs,
  loadStateMachines,
  TS_STATE_MACHINES_OUTPUT,
} from '../scripts/state-machines.mjs';

const SPEC = new URL('../openapi/openapi.yaml', import.meta.url);

/** Section 3, transcribed: initial state and, for every state, where it may go. */
const SECTION_3 = {
  MatchStatus: {
    column: 'matches.status',
    initial: 'scheduled',
    transitions: {
      scheduled: ['recording', 'cancelled'],
      recording: ['recorded'],
      recorded: ['processing'],
      processing: ['published', 'failed'],
      published: ['needs_review', 'archived'],
      needs_review: ['published'],
      archived: [],
      failed: ['processing'],
      cancelled: [],
    },
  },
  BookingStatus: {
    column: 'bookings.status',
    initial: 'held',
    transitions: {
      held: ['confirmed', 'expired'],
      confirmed: ['completed', 'cancelled', 'no_show'],
      completed: [],
      cancelled: [],
      no_show: [],
      expired: [],
    },
  },
  ProcessingJobStatus: {
    column: 'processing_jobs.status',
    initial: 'queued',
    transitions: {
      queued: ['running'],
      running: ['succeeded', 'failed'],
      succeeded: [],
      failed: [],
    },
  },
  PaymentStatus: {
    column: 'payments.status',
    initial: 'pending',
    transitions: {
      pending: ['approved', 'rejected'],
      approved: ['refunded'],
      rejected: [],
      refunded: [],
    },
  },
  SettlementStatus: {
    column: 'settlements.status',
    initial: 'draft',
    transitions: {
      draft: ['approved'],
      approved: ['invoiced'],
      invoiced: ['paid'],
      paid: [],
    },
  },
};

async function loadContract() {
  return YAML.parse(await readFile(SPEC, 'utf8'));
}

/** Import the committed generated/typescript/state-machines.ts (its imports are type-only). */
async function importGenerated() {
  const source = await readFile(TS_STATE_MACHINES_OUTPUT, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const generated = await importGenerated();

describe('generated TypeScript state machines', () => {
  test('match the committed generated/typescript/state-machines.ts (no drift)', async () => {
    const committed = await readFile(TS_STATE_MACHINES_OUTPUT, 'utf8');
    assert.equal(
      await generateStateMachinesTs(loadStateMachines(await loadContract())),
      committed,
      'Run `pnpm contracts:generate` and commit the result.',
    );
  });

  test('export exactly the five machines of section 3', () => {
    assert.deepEqual(Object.keys(generated.stateMachines).sort(), Object.keys(SECTION_3).sort());
  });

  for (const [name, expected] of Object.entries(SECTION_3)) {
    describe(name, () => {
      const machine = generated.stateMachines[name];
      const states = Object.keys(expected.transitions);

      test('has the states, column and initial state of section 3', () => {
        assert.deepEqual([...machine.states].sort(), [...states].sort());
        assert.equal(machine.column, expected.column);
        assert.equal(machine.initial, expected.initial);
      });

      // Every ordered pair of states: allowed exactly when section 3 lists it.
      for (const from of states) {
        for (const to of states) {
          const allowed = expected.transitions[from].includes(to);
          test(`${from} -> ${to} is ${allowed ? 'allowed' : 'forbidden'}`, () => {
            assert.equal(generated.canTransition(machine, from, to), allowed);
          });
        }
      }

      test('is frozen', () => {
        assert.ok(Object.isFrozen(machine));
        assert.ok(Object.isFrozen(machine.transitions));
        assert.ok(Object.values(machine.transitions).every((targets) => Object.isFrozen(targets)));
      });
    });
  }
});

describe('contract status enums', () => {
  test('every status schema of section 3 has an x-state-machine', async () => {
    const schemas = (await loadContract()).components.schemas;
    for (const name of Object.keys(SECTION_3)) {
      assert.ok(schemas[name]?.['x-state-machine'], `${name} needs x-state-machine`);
    }
  });

  test('enum values are exactly the states of the generated tables', async () => {
    const schemas = (await loadContract()).components.schemas;
    for (const [name, machine] of Object.entries(generated.stateMachines)) {
      assert.deepEqual(schemas[name].enum, [...machine.states], name);
      assert.deepEqual(
        Object.keys(machine.transitions),
        schemas[name].enum,
        `${name}: one transitions entry per enum value`,
      );
    }
  });
});

describe('state machine validation (lint and generation)', () => {
  const valid = () => ({
    type: 'string',
    enum: ['a', 'b'],
    'x-state-machine': { column: 'things.status', initial: 'a', transitions: { a: ['b'], b: [] } },
  });

  test('accepts a consistent machine', () => {
    assert.deepEqual(stateMachine(valid()), []);
  });

  const broken = {
    'a target outside the enum': (s) => s['x-state-machine'].transitions.a.push('c'),
    'a state without transitions entry': (s) => delete s['x-state-machine'].transitions.b,
    'a transitions entry outside the enum': (s) => (s['x-state-machine'].transitions.c = []),
    'an initial state outside the enum': (s) => (s['x-state-machine'].initial = 'c'),
    'a self transition': (s) => s['x-state-machine'].transitions.b.push('b'),
    'a duplicate target': (s) => s['x-state-machine'].transitions.a.push('b'),
    'a missing column': (s) => delete s['x-state-machine'].column,
  };
  for (const [label, mutate] of Object.entries(broken)) {
    test(`rejects ${label}`, () => {
      const schema = valid();
      mutate(schema);
      assert.notDeepEqual(stateMachine(schema), []);
      assert.throws(() => loadStateMachines({ components: { schemas: { ThingStatus: schema } } }));
    });
  }
});
