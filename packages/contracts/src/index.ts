// Public entry of @app/contracts for TypeScript consumers (api, web, mobile).
// Types come from generated/typescript/schema.ts and transition tables from
// generated/typescript/state-machines.ts, both produced by `pnpm contracts:generate` from
// openapi/openapi.yaml. Nothing here is written by hand except the thin client factory.
import createClient from 'openapi-fetch';
import type { Client, ClientOptions } from 'openapi-fetch';

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

/** A schema of `components.schemas`, e.g. `Schema<'Error'>`. */
export type Schema<Name extends keyof components['schemas']> = components['schemas'][Name];

/** Typed HTTP client for `/v1`: paths, parameters, bodies and responses come from the contract. */
export type ApiClient = Client<paths>;

/** Create a typed client for the public API. `baseUrl` is the server root including `/v1`. */
export function createApiClient(options: ClientOptions): ApiClient {
  return createClient<paths>(options);
}
