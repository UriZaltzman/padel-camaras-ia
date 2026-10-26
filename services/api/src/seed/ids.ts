import { createHash } from 'node:crypto';

/**
 * Deterministic UUID v7-shaped id for a seed row: the same key always gives the same id, so
 * running the seed twice finds the same rows (idempotent) and tests can name them.
 */
export function seedId(key: string): string {
  const hex = createHash('sha256').update(`seed:${key}`).digest('hex');
  const variant = ((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `7${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
