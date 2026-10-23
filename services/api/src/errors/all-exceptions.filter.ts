import {
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Logger } from 'pino';
import { ZodError, type core } from 'zod';
import { errorMessage } from '../i18n/messages';
import { AppError } from './app-error';
import { httpStatusFor, type ErrorCode } from './error-codes';

/** Body of every 4xx and 5xx response (`Error` schema in the contract). */
export interface ErrorBody {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

interface Resolved {
  code: ErrorCode;
  status: number;
  details?: Record<string, unknown>;
  retryAfterSeconds?: number;
}

// HTTP errors raised by NestJS or Express (unknown route, malformed JSON, ...) that do not
// carry a catalog code of their own.
const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'VALIDATION_FAILED',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'VALIDATION_FAILED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

const RULE_BY_ZOD_CODE: Partial<Record<core.$ZodIssue['code'], string>> = {
  too_big: 'max',
  too_small: 'min',
  invalid_format: 'format',
  invalid_type: 'type',
};

/** Turns every exception into `{code, message, details}`. Technical detail only goes to the log. */
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { code, status, details, retryAfterSeconds } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error({ code, status, err: exception }, 'request failed');
    } else {
      this.logger.info({ code, status }, 'request rejected');
    }

    const body: ErrorBody = { code, message: errorMessage(code) };
    if (details !== undefined) {
      body.details = details;
    }
    if (!response.headersSent) {
      if (retryAfterSeconds !== undefined) {
        response.setHeader('Retry-After', String(retryAfterSeconds));
      }
      response.status(status).json(body);
    }
  }

  private resolve(exception: unknown): Resolved {
    if (exception instanceof AppError) {
      return {
        code: exception.code,
        status: httpStatusFor(exception.code),
        details: exception.details,
        retryAfterSeconds: exception.retryAfterSeconds,
      };
    }
    if (exception instanceof ZodError) {
      const code = 'VALIDATION_FAILED';
      return {
        code,
        status: httpStatusFor(code),
        details: { issues: toValidationIssues(exception) },
      };
    }
    const status = httpStatusOf(exception);
    const code = status === undefined ? undefined : CODE_BY_STATUS[status];
    if (code !== undefined) {
      return { code, status: httpStatusFor(code) };
    }
    return { code: 'INTERNAL_ERROR', status: httpStatusFor('INTERNAL_ERROR') };
  }
}

function httpStatusOf(exception: unknown): number | undefined {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }
  // Errors from Express middleware (e.g. body-parser) carry `status` and `expose: true`.
  if (typeof exception === 'object' && exception !== null && 'status' in exception) {
    const { status, expose } = exception as { status: unknown; expose?: unknown };
    if (typeof status === 'number' && expose === true) {
      return status;
    }
  }
  return undefined;
}

/** `ValidationIssue` items: a JSON pointer and the rule that failed, never the invalid value. */
export function toValidationIssues(error: ZodError): { path: string; rule: string }[] {
  return error.issues.map((issue) => ({
    path: '/' + issue.path.map((segment) => String(segment)).join('/'),
    rule: RULE_BY_ZOD_CODE[issue.code] ?? issue.code,
  }));
}
