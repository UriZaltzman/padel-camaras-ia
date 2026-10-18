// Transition tables of section 3, exported from the `x-state-machine` of each status schema in
// openapi/openapi.yaml. The contract is their single source: this module turns them into
// generated/typescript/state-machines.ts (api) and generated/python/app_contracts/state_machines.py
// (edge-agent, ml). Shared by generate.mjs and the tests.
import * as prettier from 'prettier';

import stateMachine from '../spectral/functions/stateMachine.js';

export const TS_STATE_MACHINES_OUTPUT = new URL(
  '../generated/typescript/state-machines.ts',
  import.meta.url,
);
export const PY_STATE_MACHINES_OUTPUT = 'generated/python/app_contracts/state_machines.py';

/**
 * @typedef {object} Machine
 * @property {string} name Schema name, e.g. `MatchStatus`.
 * @property {string} column Database column, e.g. `matches.status`.
 * @property {string} initial
 * @property {string[]} states In enum order.
 * @property {Record<string, string[]>} transitions For every state, in enum order.
 */

/**
 * Read every status schema with `x-state-machine` from a parsed contract.
 * @param {any} contract Parsed openapi.yaml.
 * @returns {Machine[]}
 */
export function loadStateMachines(contract) {
  const machines = [];
  for (const [name, schema] of Object.entries(contract.components?.schemas ?? {})) {
    if (!schema?.['x-state-machine']) continue;
    const problems = stateMachine(schema);
    if (problems.length > 0) {
      throw new Error(`contracts: ${name}: ${problems.map((p) => p.message).join(' ')}`);
    }
    const { column, initial, transitions } = schema['x-state-machine'];
    machines.push({
      name,
      column,
      initial,
      states: [...schema.enum],
      transitions: Object.fromEntries(schema.enum.map((state) => [state, [...transitions[state]]])),
    });
  }
  return machines;
}

const lowerFirst = (name) => name[0].toLowerCase() + name.slice(1);
const screamingSnake = (name) => name.replace(/(?<=[a-z0-9])(?=[A-Z])/g, '_').toUpperCase();
const pyMember = (enumName, state) => `${enumName}.${state}`;

const HEADER_TS = `/**
 * Generated from packages/contracts/openapi/openapi.yaml (\`x-state-machine\`) by
 * \`pnpm contracts:generate\`. Do not edit: change the contract and regenerate.
 */
`;

/**
 * TypeScript source of generated/typescript/state-machines.ts.
 * @param {Machine[]} machines
 * @returns {Promise<string>}
 */
export async function generateStateMachinesTs(machines) {
  const parts = [
    HEADER_TS,
    `import type { components } from './schema';`,
    '',
    `/** A status lifecycle of section 3: its states, its initial state and the allowed moves. */`,
    `export interface StateMachine<S extends string> {`,
    `  /** Database column that stores the status, e.g. \`matches.status\`. */`,
    `  readonly column: string;`,
    `  /** Status of a newly created row. */`,
    `  readonly initial: S;`,
    `  /** Every status, in contract order. */`,
    `  readonly states: readonly S[];`,
    `  /** For every status, the statuses it may move to. An empty list is a final status. */`,
    `  readonly transitions: Readonly<Record<S, readonly S[]>>;`,
    `}`,
    '',
    `function define<S extends string>(machine: StateMachine<S>): StateMachine<S> {`,
    `  for (const targets of Object.values<readonly S[]>(machine.transitions)) Object.freeze(targets);`,
    `  Object.freeze(machine.states);`,
    `  Object.freeze(machine.transitions);`,
    `  return Object.freeze(machine);`,
    `}`,
    '',
  ];
  for (const m of machines) {
    const transitions = m.states
      .map((s) => `    ${s}: [${m.transitions[s].map((t) => `'${t}'`).join(', ')}],`)
      .join('\n');
    parts.push(
      `/** \`${m.column}\`. */`,
      `export const ${lowerFirst(m.name)}Machine = define<components['schemas']['${m.name}']>({`,
      `  column: '${m.column}',`,
      `  initial: '${m.initial}',`,
      `  states: [${m.states.map((s) => `'${s}'`).join(', ')}],`,
      `  transitions: {`,
      transitions,
      `  },`,
      `});`,
      '',
    );
  }
  parts.push(
    `/** Every state machine, by status schema name. */`,
    `export const stateMachines = {`,
    ...machines.map((m) => `  ${m.name}: ${lowerFirst(m.name)}Machine,`),
    `} as const;`,
    '',
    `export type StateMachineName = keyof typeof stateMachines;`,
    '',
    `/** Whether \`from\` may move to \`to\`. Any other change must be rejected with INVALID_STATE_TRANSITION. */`,
    `export function canTransition<S extends string>(machine: StateMachine<S>, from: S, to: S): boolean {`,
    `  return machine.transitions[from].includes(to);`,
    `}`,
    '',
  );
  const config = await prettier.resolveConfig(TS_STATE_MACHINES_OUTPUT);
  return prettier.format(parts.join('\n'), { ...config, parser: 'typescript' });
}

const HEADER_PY = `# Generated from packages/contracts/openapi/openapi.yaml (\`x-state-machine\`) by
# \`pnpm contracts:generate\`. Do not edit: change the contract and regenerate.`;

/**
 * Python source of generated/python/app_contracts/state_machines.py (formatted later by ruff).
 * @param {Machine[]} machines
 * @returns {string}
 */
export function generateStateMachinesPy(machines) {
  const names = machines.map((m) => m.name).sort();
  const lines = [
    HEADER_PY,
    '"""Allowed status transitions of section 3 of the specification.',
    '',
    'Any change outside these tables must be rejected with ``INVALID_STATE_TRANSITION``.',
    '"""',
    '',
    'from collections.abc import Mapping',
    'from dataclasses import dataclass',
    'from enum import StrEnum',
    'from types import MappingProxyType',
    'from typing import Any, Final',
    '',
    `from app_contracts.models import ${names.join(', ')}`,
    '',
    '',
    '@dataclass(frozen=True, slots=True)',
    'class StateMachine[S: StrEnum]:',
    '    """A status lifecycle: its states, its initial state and the allowed moves."""',
    '',
    '    column: str',
    '    """Database column that stores the status, e.g. ``matches.status``."""',
    '    initial: S',
    '    """Status of a newly created row."""',
    '    states: tuple[S, ...]',
    '    """Every status, in contract order."""',
    '    transitions: Mapping[S, frozenset[S]]',
    '    """For every status, the statuses it may move to. Empty for a final status."""',
    '',
    '    def can_transition(self, current: S, target: S) -> bool:',
    '        """Whether ``current`` may move to ``target``."""',
    '        return target in self.transitions[current]',
    '',
  ];
  for (const m of machines) {
    lines.push(
      '',
      `${screamingSnake(m.name)}_MACHINE: Final = StateMachine[${m.name}](`,
      `    column="${m.column}",`,
      `    initial=${pyMember(m.name, m.initial)},`,
      `    states=(${m.states.map((s) => pyMember(m.name, s)).join(', ')},),`,
      '    transitions=MappingProxyType(',
      '        {',
      ...m.states.map((s) => {
        const targets = m.transitions[s].map((t) => pyMember(m.name, t));
        const set = targets.length === 0 ? 'frozenset()' : `frozenset({${targets.join(', ')}})`;
        return `            ${pyMember(m.name, s)}: ${set},`;
      }),
      '        }',
      '    ),',
      ')',
      `"""\`\`${m.column}\`\`."""`,
    );
  }
  lines.push(
    '',
    'STATE_MACHINES: Final[Mapping[str, StateMachine[Any]]] = MappingProxyType(',
    '    {',
    ...machines.map((m) => `        "${m.name}": ${screamingSnake(m.name)}_MACHINE,`),
    '    }',
    ')',
    '"""Every state machine, by status schema name."""',
    '',
  );
  return lines.join('\n');
}
