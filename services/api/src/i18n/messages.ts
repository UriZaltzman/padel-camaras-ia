import { brand } from '@app/config/brand';
import type { ErrorCode } from '../errors/error-codes';
import errorsEsAr from './es-AR/errors.json';

// Assigning the JSON to this type makes `typecheck` fail when a catalog code has no message.
const ERROR_MESSAGES: Record<ErrorCode, string> = errorsEsAr;

/**
 * Replaces `{placeholders}` in a translation. `{brand}` always comes from `@app/config/brand`;
 * unknown placeholders are left as they are so a missing parameter is visible, not silent.
 */
export function interpolate(template: string, params: Record<string, string> = {}): string {
  const values: Record<string, string> = { ...params, brand: brand.name };
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

export function errorMessage(code: ErrorCode): string {
  return interpolate(ERROR_MESSAGES[code]);
}
