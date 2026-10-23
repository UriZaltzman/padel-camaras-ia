import { z } from 'zod';

/**
 * Every environment variable the API reads, validated once at startup.
 * A missing or invalid variable stops the process before it serves anything.
 * Secrets come from the secrets manager in deployed environments, never from the repo.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    /** Key for hashing one-time codes (HMAC). Required in production; development has a default. */
    AUTH_OTP_SECRET: z.string().min(32).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.AUTH_OTP_SECRET === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_OTP_SECRET'],
        message: 'required in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface EnvProblem {
  variable: string;
  problem: 'missing' | 'invalid';
}

/** Lists the variables that failed, never their values (they may hold secrets). */
export class EnvValidationError extends Error {
  constructor(readonly problems: readonly EnvProblem[]) {
    super(
      `Invalid environment: ${problems.map((p) => `${p.variable} is ${p.problem}`).join(', ')}`,
    );
    this.name = 'EnvValidationError';
  }
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (result.success) {
    return result.data;
  }
  const problems = result.error.issues.map((issue): EnvProblem => {
    const variable = issue.path.join('.');
    const raw = source[variable];
    return { variable, problem: raw === undefined || raw === '' ? 'missing' : 'invalid' };
  });
  throw new EnvValidationError(problems);
}
