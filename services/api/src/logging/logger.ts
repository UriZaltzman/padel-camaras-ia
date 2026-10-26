import type { LoggerService } from '@nestjs/common';
import pino, { type DestinationStream, type Level, type Logger } from 'pino';
import type { Env } from '../config/env';
import { currentLogContext } from './request-context';

/**
 * Keys that may hold personal data or credentials. They are censored wherever they appear
 * (top level or one level deep), as a safety net: code should not log them in the first place.
 */
const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'otp',
  'current_password',
  'new_password',
  'totp_code',
  'secret',
  'otpauth_uri',
  'reset_token',
  'code_verifier',
  'phone',
  'email',
  'first_name',
  'full_name',
  'last_name',
  'dni',
  'cuit',
  'address',
];

export const REDACT_PATHS = SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`]);

/** JSON logger. Each line gets `request_id`, `club_id` and `match_id` of the current request. */
export function createLogger(env: Pick<Env, 'LOG_LEVEL'>, destination?: DestinationStream): Logger {
  return pino(
    {
      level: env.LOG_LEVEL,
      base: { service: 'api' },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      mixin: () => ({ ...currentLogContext() }),
    },
    destination,
  );
}

/** Routes NestJS framework logs (and `new Logger(context)` in modules) to pino. */
export class PinoLoggerService implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('trace', message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.write('fatal', message, params);
  }

  // NestJS passes the context name as the last string parameter, and for errors
  // the stack trace before it.
  private write(level: Level, message: unknown, params: unknown[]): void {
    const strings = params.filter((param): param is string => typeof param === 'string');
    const context = strings.length > 0 ? strings[strings.length - 1] : undefined;
    const stack = level === 'error' && strings.length > 1 ? strings[0] : undefined;
    const fields = { context, stack };
    if (message instanceof Error) {
      this.logger[level]({ ...fields, err: message }, message.message);
    } else if (typeof message === 'string') {
      this.logger[level](fields, message);
    } else {
      this.logger[level]({ ...fields, data: message }, 'log');
    }
  }
}
