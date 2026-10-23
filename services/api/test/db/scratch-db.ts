import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Server where scratch databases can be created; integration tests skip when it is unset. */
export const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;

const migrationsDir = join(__dirname, '..', '..', 'prisma', 'migrations');

export function withDb(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

export function psql(url: string, sql: string): string {
  return execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-c', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** Creates a database with every migration applied. Returns its URL and a cleanup function. */
export function createScratchDb(prefix: string): { url: string; drop: () => void } {
  const admin = adminUrl as string;
  const name = `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  psql(admin, `CREATE DATABASE ${name}`);
  const url = withDb(admin, name);
  for (const dir of readdirSync(migrationsDir).sort()) {
    if (dir.endsWith('.toml')) continue;
    execFileSync(
      'psql',
      [url, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-f', join(migrationsDir, dir, 'migration.sql')],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  }
  return { url, drop: () => psql(admin, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`) };
}
