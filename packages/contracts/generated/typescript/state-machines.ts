/**
 * Generated from packages/contracts/openapi/openapi.yaml (`x-state-machine`) by
 * `pnpm contracts:generate`. Do not edit: change the contract and regenerate.
 */

import type { components } from './schema';

/** A status lifecycle of section 3: its states, its initial state and the allowed moves. */
export interface StateMachine<S extends string> {
  /** Database column that stores the status, e.g. `matches.status`. */
  readonly column: string;
  /** Status of a newly created row. */
  readonly initial: S;
  /** Every status, in contract order. */
  readonly states: readonly S[];
  /** For every status, the statuses it may move to. An empty list is a final status. */
  readonly transitions: Readonly<Record<S, readonly S[]>>;
}

function define<S extends string>(machine: StateMachine<S>): StateMachine<S> {
  for (const targets of Object.values<readonly S[]>(machine.transitions)) Object.freeze(targets);
  Object.freeze(machine.states);
  Object.freeze(machine.transitions);
  return Object.freeze(machine);
}

/** `matches.status`. */
export const matchStatusMachine = define<components['schemas']['MatchStatus']>({
  column: 'matches.status',
  initial: 'scheduled',
  states: [
    'scheduled',
    'recording',
    'recorded',
    'processing',
    'published',
    'needs_review',
    'archived',
    'failed',
    'cancelled',
  ],
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
});

/** `bookings.status`. */
export const bookingStatusMachine = define<components['schemas']['BookingStatus']>({
  column: 'bookings.status',
  initial: 'held',
  states: ['held', 'confirmed', 'completed', 'cancelled', 'no_show', 'expired'],
  transitions: {
    held: ['confirmed', 'expired'],
    confirmed: ['completed', 'cancelled', 'no_show'],
    completed: [],
    cancelled: [],
    no_show: [],
    expired: [],
  },
});

/** `processing_jobs.status`. */
export const processingJobStatusMachine = define<components['schemas']['ProcessingJobStatus']>({
  column: 'processing_jobs.status',
  initial: 'queued',
  states: ['queued', 'running', 'succeeded', 'failed'],
  transitions: {
    queued: ['running'],
    running: ['succeeded', 'failed'],
    succeeded: [],
    failed: [],
  },
});

/** `payments.status`. */
export const paymentStatusMachine = define<components['schemas']['PaymentStatus']>({
  column: 'payments.status',
  initial: 'pending',
  states: ['pending', 'approved', 'rejected', 'refunded'],
  transitions: {
    pending: ['approved', 'rejected'],
    approved: ['refunded'],
    rejected: [],
    refunded: [],
  },
});

/** `settlements.status`. */
export const settlementStatusMachine = define<components['schemas']['SettlementStatus']>({
  column: 'settlements.status',
  initial: 'draft',
  states: ['draft', 'approved', 'invoiced', 'paid'],
  transitions: {
    draft: ['approved'],
    approved: ['invoiced'],
    invoiced: ['paid'],
    paid: [],
  },
});

/** Every state machine, by status schema name. */
export const stateMachines = {
  MatchStatus: matchStatusMachine,
  BookingStatus: bookingStatusMachine,
  ProcessingJobStatus: processingJobStatusMachine,
  PaymentStatus: paymentStatusMachine,
  SettlementStatus: settlementStatusMachine,
} as const;

export type StateMachineName = keyof typeof stateMachines;

/** Whether `from` may move to `to`. Any other change must be rejected with INVALID_STATE_TRANSITION. */
export function canTransition<S extends string>(machine: StateMachine<S>, from: S, to: S): boolean {
  return machine.transitions[from].includes(to);
}
