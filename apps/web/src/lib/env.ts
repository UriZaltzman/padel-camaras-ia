import { z } from 'zod';

// Public settings, validated when the app starts. Next inlines `NEXT_PUBLIC_*` only when each one is
// read explicitly, so they are listed one by one.
const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default('http://localhost:3000/v1'),
  // Until the API serves an endpoint, the web answers from a mock built on the contract.
  NEXT_PUBLIC_API_MOCK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}

export const env = parseEnv({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_API_MOCK: process.env.NEXT_PUBLIC_API_MOCK,
});
