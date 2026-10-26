// Single entry point for the contract's error catalog. The rest of the API imports from here,
// never from `@app/contracts` directly, so a change in how the catalog is generated stays here.
//
// `ErrorCode` is the type generated from the contract (`pnpm contracts:generate`). The generated
// types do not carry `x-error-catalog`, so the HTTP status of each code is listed below:
// - `typecheck` fails if a contract code is missing here or if a code here is not in the contract;
// - test/contract/error-catalog.test.ts fails if a status differs from `x-error-catalog`.
import type { Schema } from '@app/contracts';

export type ErrorCode = Schema<'ErrorCode'>;

const HTTP_STATUS = {
  // Common
  VALIDATION_FAILED: 400,
  INVALID_CURSOR: 400,
  UNAUTHENTICATED: 401,
  ACCESS_TOKEN_EXPIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_STATE_TRANSITION: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  // Auth and users
  OTP_INVALID: 401,
  OTP_EXPIRED: 401,
  OTP_ATTEMPTS_EXCEEDED: 401,
  REFRESH_TOKEN_INVALID: 401,
  TERMS_NOT_ACCEPTED: 403,
  INVALID_CREDENTIALS: 401,
  SECOND_FACTOR_REQUIRED: 401,
  SECOND_FACTOR_INVALID: 401,
  WEAK_PASSWORD: 422,
  PASSWORD_RESET_TOKEN_INVALID: 401,
  // Clubs
  CLUB_FEATURE_DISABLED: 403,
  CLUB_SERVICE_SUSPENDED: 403,
  // Bookings
  BOOKING_SLOT_TAKEN: 409,
  BOOKING_SLOT_INVALID: 422,
  BOOKING_HOLD_EXPIRED: 409,
  BOOKING_FULL: 409,
  BOOKING_INVITE_INVALID: 422,
  // Matches and media
  MATCH_NOT_PUBLISHED: 409,
  MATCH_PLAYER_SLOT_TAKEN: 409,
  MATCH_ALREADY_JOINED: 409,
  MEDIA_NOT_READY: 409,
  MEDIA_EXPIRED: 410,
  // Coaches
  COACH_ACCESS_NOT_GRANTED: 403,
  // Payments
  PAYMENT_PROVIDER_ERROR: 502,
  WEBHOOK_SIGNATURE_INVALID: 401,
  // Club panel and device
  RECORDING_NOT_ACTIVE: 409,
  DEVICE_CERTIFICATE_INVALID: 401,
  DEVICE_CLUB_MISMATCH: 403,
  // Internal console
  TARIFF_VERSION_NOT_FOUND: 404,
  TARIFF_TIERS_INVALID: 422,
  CLUB_TAX_ID_TAKEN: 409,
  PAYMENT_ALREADY_RECORDED: 409,
  SUPPORT_ACCESS_NOT_GRANTED: 403,
  // Tournaments
  TOURNAMENT_REGISTRATION_CLOSED: 409,
  TOURNAMENT_PLAYER_TAKEN: 409,
  TOURNAMENT_PAIR_COUNT_INVALID: 422,
  TOURNAMENT_NOT_ENOUGH_SLOTS: 422,
} as const satisfies Record<ErrorCode, number>;

// `satisfies` above rejects missing codes; this rejects codes the contract does not have.
type Exact<T, U> = [T] extends [U] ? ([U] extends [T] ? true : never) : never;
const exhaustive: Exact<keyof typeof HTTP_STATUS, ErrorCode> = true;
void exhaustive;

export const ERROR_CODES = Object.keys(HTTP_STATUS) as ErrorCode[];

export function httpStatusFor(code: ErrorCode): number {
  return HTTP_STATUS[code];
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(HTTP_STATUS, value);
}
