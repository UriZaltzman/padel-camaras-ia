import type { KnownException } from './coverage';

/**
 * Routes the API exposes under `/v1` that the contract does not declare yet. Temporary: each one
 * points to the issue that adds it to the contract, and the contract test fails once that issue
 * lands, so the exception is deleted instead of rotting here.
 */
export const KNOWN_EXCEPTIONS: readonly KnownException[] = [
  ...[
    'POST /v1/clubs/{clubId}/court-blocks',
    'POST /v1/clubs/{clubId}/court-blocks/holidays',
    'GET /v1/clubs/{clubId}/court-blocks',
    'DELETE /v1/clubs/{clubId}/court-blocks/{blockId}',
  ].map((route) => ({ route, issue: 304, reason: 'court blocks (#256) not in the contract yet' })),
];
