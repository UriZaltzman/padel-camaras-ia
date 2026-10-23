import type { ErrorCode } from './error-codes';

/**
 * A business error with a stable code from the contract catalog. The global filter turns it
 * into `{code, message, details}` with the catalog's HTTP status and the es-AR message.
 *
 * `details` goes to the client: only machine-readable ids and values documented for the code,
 * never personal data, tokens or stack traces. `cause` stays in the log.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details?: Record<string, unknown>,
    options?: { cause?: unknown; retryAfterSeconds?: number },
  ) {
    super(code, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }

  /** Sent as the `Retry-After` header (rate limits). */
  readonly retryAfterSeconds?: number;
}
