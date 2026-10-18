/**
 * Checks that a status schema's `x-state-machine` is consistent with its `enum`: the initial
 * state is in the enum, every enum value has exactly one `transitions` entry (an empty list is a
 * final state), and every target is another value of the enum, listed once.
 *
 * Also used by scripts/state-machines.mjs, so generation fails on the same problems as the lint.
 *
 * @param {{ enum?: unknown[], 'x-state-machine'?: any }} schema
 */
export default function stateMachine(schema) {
  const results = [];
  const machine = schema?.['x-state-machine'];
  const states = Array.isArray(schema?.enum) ? schema.enum : null;

  if (schema?.type !== 'string' || states === null || states.length === 0) {
    results.push({ message: 'A schema with `x-state-machine` must be a string `enum`.' });
    return results;
  }
  if (new Set(states).size !== states.length) {
    results.push({ message: 'The status enum has duplicate values.', path: ['enum'] });
  }
  if (machine === null || typeof machine !== 'object' || Array.isArray(machine)) {
    return [...results, { message: '`x-state-machine` must be an object.' }];
  }
  if (typeof machine.column !== 'string' || !/^[a-z_]+\.[a-z_]+$/.test(machine.column)) {
    results.push({
      message: '`x-state-machine.column` must name the database column, e.g. `matches.status`.',
      path: ['x-state-machine', 'column'],
    });
  }
  if (!states.includes(machine.initial)) {
    results.push({
      message: `Initial state ${String(machine.initial)} is not in the enum.`,
      path: ['x-state-machine', 'initial'],
    });
  }

  const transitions = machine.transitions;
  if (transitions === null || typeof transitions !== 'object' || Array.isArray(transitions)) {
    return [
      ...results,
      { message: '`x-state-machine.transitions` must be an object.', path: ['x-state-machine'] },
    ];
  }
  for (const [from, targets] of Object.entries(transitions)) {
    const path = ['x-state-machine', 'transitions', from];
    if (!states.includes(from)) {
      results.push({ message: `${from} has transitions but is not in the enum.`, path });
    }
    if (!Array.isArray(targets)) {
      results.push({ message: `Transitions of ${from} must be a list (empty if final).`, path });
      continue;
    }
    if (new Set(targets).size !== targets.length) {
      results.push({ message: `Transitions of ${from} list a state twice.`, path });
    }
    for (const to of targets) {
      if (to === from) {
        results.push({ message: `${from} cannot transition to itself.`, path });
      } else if (!states.includes(to)) {
        results.push({ message: `${from} -> ${String(to)}: target is not in the enum.`, path });
      }
    }
  }
  states.forEach((state, index) => {
    if (!Object.hasOwn(transitions, state)) {
      results.push({
        message: `${state} has no transitions entry (use [] for a final state).`,
        path: ['enum', index],
      });
    }
  });

  return results;
}
