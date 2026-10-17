// Single entry point for the contract's error catalog. The rest of the API imports from here,
// never from `../generated` directly.
//
// TODO(#32): when `pnpm contracts:generate` produces the API types, take `ErrorCode` from them
// and keep only the HTTP status map here (or from the generator if it covers `x-error-catalog`).
// Then delete scripts/generate-error-codes.mjs. Nothing outside this file should change.
import { ERROR_CATALOG, type ErrorCode } from '../generated/error-codes';

export type { ErrorCode };

export const ERROR_CODES = Object.keys(ERROR_CATALOG) as ErrorCode[];

export function httpStatusFor(code: ErrorCode): number {
  return ERROR_CATALOG[code].httpStatus;
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_CATALOG, value);
}
