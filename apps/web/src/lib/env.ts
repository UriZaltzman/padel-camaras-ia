import { z } from 'zod';

// Public settings, validated when the app starts. Next inlines `NEXT_PUBLIC_*` only when each one is
// read explicitly, so they are listed one by one.
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    NEXT_PUBLIC_API_URL: z.url().default('http://localhost:3000/v1'),
    // Until the API serves an endpoint, the web answers from a mock built on the contract.
    NEXT_PUBLIC_API_MOCK: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
  })
  // The mock never runs in a production build, whatever the flag says: `next build` sets
  // NODE_ENV=production, so the flag only works in `next dev` and in tests.
  .transform(({ NODE_ENV, ...rest }) => ({
    ...rest,
    NEXT_PUBLIC_API_MOCK: NODE_ENV !== 'production' && rest.NEXT_PUBLIC_API_MOCK,
  }));

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}

export const env = parseEnv({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_API_MOCK: process.env.NEXT_PUBLIC_API_MOCK,
});
