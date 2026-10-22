import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Integration tests against a real Postgres (the rule lives in the database, not in Node).
// Set TEST_DATABASE_ADMIN_URL to a server where a scratch database can be created, e.g.
// postgresql://postgres:postgres@localhost:5432/postgres. Skipped when it is not set.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const dbName = `bookings_excl_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const migrationsDir = join(__dirname, '..', '..', 'prisma', 'migrations');

function withDb(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

function psql(url: string, sql: string): string {
  return execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-c', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

describe.skipIf(!adminUrl)('bookings exclusion constraint', () => {
  const url = adminUrl ? withDb(adminUrl, dbName) : '';
  const clubId = randomUUID();
  const courtId = randomUUID();
  const otherCourtId = randomUUID();

  beforeAll(() => {
    psql(adminUrl as string, `CREATE DATABASE ${dbName}`);
    for (const dir of readdirSync(migrationsDir).sort()) {
      if (dir.endsWith('.toml')) continue;
      execFileSync(
        'psql',
        [url, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-f', join(migrationsDir, dir, 'migration.sql')],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    }
    psql(
      url,
      `INSERT INTO clubs (id, name, plan, updated_at) VALUES ('${clubId}', 'Test', 'loan', now());
       INSERT INTO courts (id, club_id, name, updated_at) VALUES
         ('${courtId}', '${clubId}', 'C1', now()), ('${otherCourtId}', '${clubId}', 'C2', now());`,
    );
  });

  afterAll(() => {
    if (adminUrl) psql(adminUrl, `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  });

  function insert(court: string, start: string, end: string, status = 'confirmed'): string {
    const id = randomUUID();
    psql(
      url,
      `INSERT INTO bookings (id, club_id, court_id, starts_at, ends_at, status, price_cents, origin, hold_expires_at, updated_at)
       VALUES ('${id}', '${clubId}', '${court}', '${start}', '${end}', '${status}', 1000, 'app',
               ${status === 'held' ? "now() + interval '10 minutes'" : 'NULL'}, now())`,
    );
    return id;
  }

  function sqlstate(fn: () => unknown): string | null {
    try {
      fn();
      return null;
    } catch (e) {
      const stderr = String((e as { stderr?: Buffer | string }).stderr ?? '');
      return /violates exclusion constraint/.test(stderr) ? '23P01' : `other: ${stderr}`;
    }
  }

  it('rejects an overlapping booking on the same court with 23P01', () => {
    insert(courtId, '2030-01-01T21:00:00Z', '2030-01-01T22:30:00Z');
    expect(sqlstate(() => insert(courtId, '2030-01-01T22:00:00Z', '2030-01-01T23:30:00Z'))).toBe(
      '23P01',
    );
    expect(
      sqlstate(() => insert(courtId, '2030-01-01T21:00:00Z', '2030-01-01T22:30:00Z', 'held')),
    ).toBe('23P01');
  });

  it('allows the same time on another court', () => {
    insert(courtId, '2030-01-02T21:00:00Z', '2030-01-02T22:30:00Z');
    expect(
      sqlstate(() => insert(otherCourtId, '2030-01-02T21:00:00Z', '2030-01-02T22:30:00Z')),
    ).toBeNull();
  });

  it('allows back-to-back slots (half-open ranges)', () => {
    insert(courtId, '2030-01-03T21:00:00Z', '2030-01-03T22:30:00Z');
    expect(
      sqlstate(() => insert(courtId, '2030-01-03T22:30:00Z', '2030-01-04T00:00:00Z')),
    ).toBeNull();
    expect(
      sqlstate(() => insert(courtId, '2030-01-03T19:30:00Z', '2030-01-03T21:00:00Z')),
    ).toBeNull();
  });

  it('frees the slot when the booking is cancelled or the hold expired', () => {
    for (const status of ['cancelled', 'expired']) {
      const start = status === 'cancelled' ? '2030-01-05T21:00:00Z' : '2030-01-06T21:00:00Z';
      const end = status === 'cancelled' ? '2030-01-05T22:30:00Z' : '2030-01-06T22:30:00Z';
      const id = insert(courtId, start, end, 'held');
      expect(sqlstate(() => insert(courtId, start, end))).toBe('23P01');
      psql(url, `UPDATE bookings SET status = '${status}' WHERE id = '${id}'`);
      expect(sqlstate(() => insert(courtId, start, end))).toBeNull();
    }
  });

  it('does not let a cancelled booking be revived over an occupied slot', () => {
    const start = '2030-01-07T21:00:00Z';
    const end = '2030-01-07T22:30:00Z';
    const cancelled = insert(courtId, start, end, 'cancelled');
    insert(courtId, start, end);
    expect(
      sqlstate(() =>
        psql(url, `UPDATE bookings SET status = 'confirmed' WHERE id = '${cancelled}'`),
      ),
    ).toBe('23P01');
  });

  it('validates moving a booking with UPDATE', () => {
    insert(courtId, '2030-01-08T21:00:00Z', '2030-01-08T22:30:00Z');
    const moving = insert(courtId, '2030-01-08T18:00:00Z', '2030-01-08T19:30:00Z');
    expect(
      sqlstate(() =>
        psql(
          url,
          `UPDATE bookings SET starts_at = '2030-01-08T21:30:00Z', ends_at = '2030-01-08T23:00:00Z' WHERE id = '${moving}'`,
        ),
      ),
    ).toBe('23P01');
    expect(
      sqlstate(() =>
        psql(
          url,
          `UPDATE bookings SET starts_at = '2030-01-08T22:30:00Z', ends_at = '2030-01-09T00:00:00Z' WHERE id = '${moving}'`,
        ),
      ),
    ).toBeNull();
  });

  it('keeps a booking from colliding with itself when only its end is changed', () => {
    const id = insert(courtId, '2030-01-10T21:00:00Z', '2030-01-10T22:30:00Z');
    expect(
      sqlstate(() =>
        psql(url, `UPDATE bookings SET ends_at = '2030-01-10T23:00:00Z' WHERE id = '${id}'`),
      ),
    ).toBeNull();
  });

  it('keeps the other unique keys: payment id and (match, user)', () => {
    const idx = psql(
      url,
      `SELECT indexdef FROM pg_indexes WHERE indexname IN ('payments_mercadopago_payment_id_key','match_players_match_id_user_id_key') ORDER BY indexname`,
    );
    expect(idx).toContain('UNIQUE INDEX match_players_match_id_user_id_key');
    expect(idx).toContain('UNIQUE INDEX payments_mercadopago_payment_id_key');
  });

  it('has the constraint registered as an exclusion constraint on a gist index', () => {
    const def = psql(
      url,
      `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'bookings_no_overlap_excl'`,
    );
    expect(def).toContain('EXCLUDE USING gist');
    expect(def).toContain("tstzrange(starts_at, ends_at, '[)'::text)");
  });
});
