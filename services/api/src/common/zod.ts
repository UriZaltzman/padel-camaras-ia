import type { ZodType } from 'zod';

/** Parses a request body, query or param at the edge. A failure becomes `VALIDATION_FAILED`. */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  return schema.parse(input);
}
