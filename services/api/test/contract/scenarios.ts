import type { Response } from 'supertest';
import type TestAgent from 'supertest/lib/agent';

/**
 * Extra requests per operation, beyond the generated unauthenticated one. Each response is
 * validated against the contract. Keys are operation keys, e.g. `POST /v1/bookings`.
 * Add scenarios here as modules land (authenticated calls, business errors, ...).
 */
export interface ContractScenario {
  name: string;
  /** Status the scenario must produce; it must also be documented by the operation. */
  expectedStatus: number;
  send: (http: TestAgent) => Promise<Response>;
}

export const SCENARIOS: Record<string, ContractScenario[]> = {};
