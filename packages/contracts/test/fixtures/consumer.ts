// A minimal TypeScript consumer of the contract, standing in for api, web and mobile.
// test/breaking-change.test.mjs compiles it against regenerated types: it must compile with the
// current contract and stop compiling when the contract changes incompatibly.
import { canTransition, createApiClient, matchStatusMachine } from '../../src/index';
import type { ApiClient, Schema, SchemaErrorCode, SchemaMatchStatus } from '../../src/index';

export const slotTaken: Schema<'Error'> = {
  code: 'BOOKING_SLOT_TAKEN',
  message: 'texto de prueba',
  details: { court_id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b' },
};

export function describeError(error: Schema<'Error'>): string {
  const code: SchemaErrorCode = error.code;
  return `${code}: ${error.message}`;
}

export function nextCursor(page: Schema<'Page'>): string | null {
  return page.next_cursor;
}

export const client: ApiClient = createApiClient({ baseUrl: 'http://localhost/v1' });

export function canStartRecording(status: SchemaMatchStatus): boolean {
  return canTransition(matchStatusMachine, status, 'recording');
}
