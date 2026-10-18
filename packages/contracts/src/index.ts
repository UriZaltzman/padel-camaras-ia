// Public entry of @app/contracts for TypeScript consumers (api, web, mobile).
// Types come from generated/typescript/schema.ts and transition tables from
// generated/typescript/state-machines.ts, both produced by `pnpm contracts:generate` from
// openapi/openapi.yaml; event types come from generated/typescript/events.ts, produced from
// events/*.schema.json. Nothing here is written by hand except the thin client factory.
import createClient from 'openapi-fetch';
import type { Client, ClientOptions } from 'openapi-fetch';

import type { DomainEvent, EventType } from '../generated/typescript/events';
import type { components, paths } from '../generated/typescript/schema';

export type * from '../generated/typescript/schema';

// Allowed status transitions of section 3, generated from `x-state-machine` in the contract.
export {
  bookingStatusMachine,
  canTransition,
  matchStatusMachine,
  paymentStatusMachine,
  processingJobStatusMachine,
  settlementStatusMachine,
  stateMachines,
} from '../generated/typescript/state-machines';
export type { StateMachine, StateMachineName } from '../generated/typescript/state-machines';

// Domain events of section 11, generated from events/*.schema.json. Status enums are the same
// as the API's, so they are not re-exported from here.
export { EVENT_TYPES } from '../generated/typescript/events';
export type {
  BookingCancelledEvent,
  BookingConfirmedEvent,
  ClipCreatedEvent,
  DeviceOfflineEvent,
  DomainEvent,
  EventType,
  MatchProcessedEvent,
  MatchPublishedEvent,
  MatchRecordedEvent,
  MatchRecordingStartedEvent,
  MatchScoreCorrectedEvent,
  PaymentApprovedEvent,
  PaymentRefundedEvent,
  SettlementReadyEvent,
} from '../generated/typescript/events';

/** The event whose `event_type` is `T`, e.g. `EventOf<'booking.confirmed'>`. */
export type EventOf<T extends EventType> = Extract<DomainEvent, { event_type: T }>;

/** A schema of `components.schemas`, e.g. `Schema<'Error'>`. */
export type Schema<Name extends keyof components['schemas']> = components['schemas'][Name];

/** Typed HTTP client for `/v1`: paths, parameters, bodies and responses come from the contract. */
export type ApiClient = Client<paths>;

/** Create a typed client for the public API. `baseUrl` is the server root including `/v1`. */
export function createApiClient(options: ClientOptions): ApiClient {
  return createClient<paths>(options);
}
