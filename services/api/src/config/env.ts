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
    /** PKCS#8 PEM of the EC P-256 key that signs access tokens. Required in production. */
    AUTH_JWT_PRIVATE_KEY: z.string().min(1).optional(),
    /** Secret that signs Mercado Pago webhooks (`x-signature`). Unset until the Mercado Pago account exists: the webhook then rejects everything. */
    MERCADOPAGO_WEBHOOK_SECRET: z.string().min(16).optional(),
    /** Access token of our Mercado Pago application. Unset until the account exists: checkouts then fail with PAYMENT_PROVIDER_ERROR. */
    /**
     * Internal staff allowlist: JSON object `{ "<user id>": "admin|sales|support|finance" }`.
     * Unset or empty means nobody is staff, so every `/admin` call answers 403 (fail closed).
     */
    INTERNAL_STAFF: z.string().optional(),
    MERCADOPAGO_ACCESS_TOKEN: z.string().min(1).optional(),
    /** `fake` pays every checkout without Mercado Pago, for the e2e stack. Refused in production. */
    PAYMENT_PROVIDER: z.enum(['mercadopago', 'fake']).default('mercadopago'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.PAYMENT_PROVIDER === 'fake') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_PROVIDER'],
        message: 'the fake provider is not allowed in production',
      });
    }
    if (env.NODE_ENV !== 'production') return;
    for (const name of ['AUTH_OTP_SECRET', 'AUTH_JWT_PRIVATE_KEY'] as const) {
      if (env[name] === undefined) {
        ctx.addIssue({ code: 'custom', path: [name], message: 'required in production' });
      }
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
