/** Hosts that are plainly a developer machine or a compose service of the e2e stack. */
const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'postgres',
  'db',
  'host.docker.internal',
]);

export class SeedNotAllowedError extends Error {
  constructor(reason: string) {
    super(`Refusing to seed: ${reason}`);
    this.name = 'SeedNotAllowedError';
  }
}

/**
 * The seed writes fictional clubs and people, so it must never run against production. It runs
 * only when NODE_ENV is not `production` AND the database host is local (or `SEED_ALLOW_REMOTE=1`
 * is set for a shared dev or staging database, which is still refused in production).
 */
export function assertSeedAllowed(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV === 'production') throw new SeedNotAllowedError('NODE_ENV is production');
  const url = env.DATABASE_URL;
  if (!url) throw new SeedNotAllowedError('DATABASE_URL is not set');
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  } catch {
    throw new SeedNotAllowedError('DATABASE_URL is not a valid URL');
  }
  if (!LOCAL_HOSTS.has(host) && env.SEED_ALLOW_REMOTE !== '1') {
    throw new SeedNotAllowedError(`database host "${host}" is not local (set SEED_ALLOW_REMOTE=1)`);
  }
}
