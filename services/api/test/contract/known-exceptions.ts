import type { KnownException } from './coverage';

/**
 * Routes the API exposes under `/v1` that the contract does not declare yet. Temporary: each one
 * points to the issue that adds it to the contract, and the contract test fails once that issue
 * lands, so the exception is deleted instead of rotting here.
 */
export const KNOWN_EXCEPTIONS: readonly KnownException[] = [];
