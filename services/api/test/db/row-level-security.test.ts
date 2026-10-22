import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Integration tests against a real Postgres (RLS lives in the database, not in Node).
// Set TEST_DATABASE_ADMIN_URL to a server where a scratch database can be created, e.g.
// postgresql://postgres:postgres@localhost:5432/postgres. Skipped when it is not set.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const dbName = `rls_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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

const id = (): string => randomUUID();

// Two clubs with the same cast each.
interface Club {
  id: string;
  court: string;
  staff: string;
  owner: string;
  coach: string;
  p1: string;
  p2: string;
  booking: string;
  match: string;
  asset: string;
  clip: string;
  payment: string;
  lesson: string;
  device: string;
}
const mk = (): Club => ({
  id: id(),
  court: id(),
  staff: id(),
  owner: id(),
  coach: id(),
  p1: id(),
  p2: id(),
  booking: id(),
  match: id(),
  asset: id(),
  clip: id(),
  payment: id(),
  lesson: id(),
  device: id(),
});
const A = mk();
const B = mk();
const support = id();
const outsider = id();

describe.skipIf(!adminUrl)('row level security', () => {
  const url = adminUrl ? withDb(adminUrl, dbName) : '';

  interface Ctx {
    role: string;
    user?: string;
    club?: string;
  }
  /** Runs `sql` as the unprivileged runtime role with the session context the API would set. */
  function as(ctx: Ctx, sql: string): string {
    return psql(
      url,
      `BEGIN; SET LOCAL ROLE app_runtime; SET LOCAL app.role = '${ctx.role}';` +
        `SET LOCAL app.user_id = '${ctx.user ?? ''}'; SET LOCAL app.club_id = '${ctx.club ?? ''}';` +
        `${sql}; COMMIT;`,
    );
  }
  const count = (ctx: Ctx, table: string, where = 'true'): number =>
    Number(as(ctx, `SELECT count(*) FROM ${table} WHERE ${where}`));

  beforeAll(() => {
    psql(adminUrl as string, `CREATE DATABASE ${dbName}`);
    for (const dir of readdirSync(migrationsDir).sort()) {
      if (dir.endsWith('.toml')) continue;
      execFileSync(
        'psql',
        [url, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-f', join(migrationsDir, dir, 'migration.sql')],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
    }
    const seed = (c: Club, n: string): string => `
      INSERT INTO clubs (id, name, plan, updated_at) VALUES ('${c.id}', 'Club ${n}', 'loan', now());
      INSERT INTO users (id, name, updated_at) VALUES
        ('${c.staff}','staff${n}',now()),('${c.owner}','owner${n}',now()),('${c.coach}','coach${n}',now()),
        ('${c.p1}','p1${n}',now()),('${c.p2}','p2${n}',now());
      INSERT INTO memberships (id, club_id, user_id, role, updated_at) VALUES
        ('${id()}','${c.id}','${c.staff}','staff',now()),('${id()}','${c.id}','${c.owner}','owner',now()),
        ('${id()}','${c.id}','${c.coach}','coach',now()),('${id()}','${c.id}','${c.p1}','player',now());
      INSERT INTO courts (id, club_id, name, updated_at) VALUES ('${c.court}','${c.id}','C1',now());
      INSERT INTO devices (id, club_id, serial_number, updated_at) VALUES ('${c.device}','${c.id}','sn-${n}',now());
      INSERT INTO bookings (id, club_id, court_id, starts_at, ends_at, status, origin, price_cents, created_by_user_id, updated_at)
        VALUES ('${c.booking}','${c.id}','${c.court}','2026-11-01 18:00+00','2026-11-01 19:30+00','confirmed','app',1000,'${c.p1}',now());
      INSERT INTO matches (id, club_id, court_id, starts_at, ends_at, updated_at)
        VALUES ('${c.match}','${c.id}','${c.court}','2026-11-01 18:00+00','2026-11-01 19:30+00',now());
      INSERT INTO match_players (id, club_id, match_id, user_id, team, initial_side, track_index, updated_at) VALUES
        ('${id()}','${c.id}','${c.match}','${c.p1}',1,'a',0,now()),('${id()}','${c.id}','${c.match}','${c.p2}',2,'b',1,now());
      INSERT INTO match_stats (id, club_id, match_id, user_id, formula_version, stats, updated_at)
        VALUES ('${id()}','${c.id}','${c.match}','${c.p1}','v1','{}',now());
      INSERT INTO media_assets (id, club_id, match_id, type, storage_path, updated_at)
        VALUES ('${c.asset}','${c.id}','${c.match}','full','x/${n}',now());
      INSERT INTO clips (id, club_id, match_id, user_id, origin, start_ms, end_ms, updated_at)
        VALUES ('${c.clip}','${c.id}','${c.match}','${c.p1}','app',0,1000,now());
      INSERT INTO payments (id, club_id, user_id, concept, amount_cents, updated_at)
        VALUES ('${c.payment}','${c.id}','${c.p1}','deposit',500,now());
      INSERT INTO lessons (id, club_id, match_id, coach_user_id, updated_at)
        VALUES ('${c.lesson}','${c.id}','${c.match}','${c.coach}',now());
      INSERT INTO notifications (id, club_id, user_id, channel, type, payload, updated_at)
        VALUES ('${id()}','${c.id}','${c.p1}','push','t','{}',now());
      INSERT INTO audit_log (id, club_id, action, entity_type) VALUES ('${id()}','${c.id}','x','booking');`;
    psql(
      url,
      `${seed(A, 'A')} ${seed(B, 'B')}
       INSERT INTO users (id, name, updated_at) VALUES ('${support}','support',now()),('${outsider}','out',now());`,
    );
  });

  afterAll(() => {
    if (adminUrl) psql(adminUrl, `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  });

  const staffA: Ctx = { role: 'staff', user: A.staff, club: A.id };
  const ownerA: Ctx = { role: 'owner', user: A.owner, club: A.id };
  const deviceA: Ctx = { role: 'club_device', club: A.id };
  const coachA: Ctx = { role: 'coach', user: A.coach, club: A.id };
  const playerA: Ctx = { role: 'player', user: A.p1 };
  const supportCtx: Ctx = { role: 'support', user: support };

  const clubTables = [
    'memberships',
    'courts',
    'devices',
    'bookings',
    'booking_players',
    'matches',
    'match_players',
    'media_assets',
    'clips',
    'lessons',
    'audit_log',
    'payments',
    'settlements',
    'processing_jobs',
  ];

  it('fails closed with no session context', () => {
    for (const t of ['clubs', 'users', 'bookings', 'matches', 'payments']) {
      expect(count({ role: '' }, t), t).toBe(0);
    }
  });

  it('is enabled on every table that carries club_id (and people tables)', () => {
    const missing = psql(
      url,
      `SELECT string_agg(c.relname, ',') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
          AND c.relname NOT LIKE '\\_%' AND c.relname <> '_prisma_migrations'`,
    );
    expect(missing).toBe('');
  });

  describe.each([
    ['staff', staffA],
    ['owner', ownerA],
    ['club_device', deviceA],
  ])('%s of club A', (_name, ctx) => {
    it('never reads a row of club B', () => {
      for (const t of ['devices', 'bookings', 'matches', 'match_players', 'clips']) {
        expect(count(ctx, t, `club_id = '${B.id}'`), t).toBe(0);
        expect(count(ctx, t, `club_id = '${A.id}'`), t).toBeGreaterThan(0);
      }
    });
    it('cannot update a club B row', () => {
      expect(
        as(ctx, `UPDATE matches SET model_version = 'x' WHERE id = '${B.match}' RETURNING id`),
      ).toBe('');
      expect(
        as(ctx, `UPDATE devices SET serial_number = 'x' WHERE id = '${B.device}' RETURNING id`),
      ).toBe('');
    });
    it('cannot delete a club B row', () => {
      expect(as(ctx, `DELETE FROM clips WHERE id = '${B.clip}' RETURNING id`)).toBe('');
    });
    it('cannot insert a row for club B', () => {
      expect(() =>
        as(
          ctx,
          `INSERT INTO matches (id, club_id, court_id, starts_at, ends_at, updated_at)
           VALUES ('${id()}','${B.id}','${B.court}',now(),now(),now())`,
        ),
      ).toThrow(/row-level security/);
    });
  });

  it('a role of club A cannot write club B even with club A context on the row (cross-club FK)', () => {
    expect(() =>
      as(
        deviceA,
        `INSERT INTO matches (id, club_id, court_id, starts_at, ends_at, updated_at)
         VALUES ('${id()}','${A.id}','${B.court}',now(),now(),now())`,
      ),
    ).toThrow(/foreign key|violates/);
  });

  it('staff and owner never see personal statistics', () => {
    expect(count(staffA, 'match_stats')).toBe(0);
    expect(count(ownerA, 'match_stats')).toBe(0);
    expect(count(staffA, 'insights')).toBe(0);
    expect(count(supportCtx, 'match_stats')).toBe(0);
    expect(count(coachA, 'match_stats')).toBe(0);
  });

  it('staff do not see payments; the owner sees only the own club payments', () => {
    expect(count(staffA, 'payments')).toBe(0);
    expect(count(ownerA, 'payments')).toBe(1);
    expect(count(ownerA, 'payments', `club_id = '${B.id}'`)).toBe(0);
  });

  it('a player only sees the matches they played', () => {
    expect(as(playerA, `SELECT id FROM matches`)).toBe(A.match);
    expect(count({ role: 'player', user: outsider }, 'matches')).toBe(0);
    expect(count({ role: 'player', user: outsider }, 'match_players')).toBe(0);
    expect(count({ role: 'player', user: outsider }, 'clips')).toBe(0);
    expect(count({ role: 'player', user: outsider }, 'media_assets')).toBe(0);
  });

  it('a player sees teammates of their match only', () => {
    expect(count(playerA, 'match_players')).toBe(2);
    expect(count(playerA, 'users', `id = '${A.p2}'`)).toBe(1);
    expect(count(playerA, 'users', `id = '${B.p1}'`)).toBe(0);
  });

  it('a player sees only their own stats, payments, notifications and bookings', () => {
    expect(count(playerA, 'match_stats')).toBe(1);
    expect(count({ role: 'player', user: A.p2 }, 'match_stats')).toBe(0);
    expect(count(playerA, 'payments')).toBe(1);
    expect(count({ role: 'player', user: A.p2 }, 'payments')).toBe(0);
    expect(count(playerA, 'notifications')).toBe(1);
    expect(count({ role: 'player', user: A.p2 }, 'notifications')).toBe(0);
    expect(count(playerA, 'bookings')).toBe(1);
    expect(count({ role: 'player', user: A.p2 }, 'bookings')).toBe(0);
  });

  it('a player cannot touch another player or club data', () => {
    expect(as(playerA, `UPDATE matches SET model_version = 'x' RETURNING id`)).toBe('');
    expect(
      as(playerA, `UPDATE bookings SET price_cents = 1 WHERE id = '${B.booking}' RETURNING id`),
    ).toBe('');
    expect(as(playerA, `DELETE FROM clips WHERE id = '${B.clip}' RETURNING id`)).toBe('');
    expect(as(playerA, `UPDATE users SET name = 'hax' WHERE id = '${A.p2}' RETURNING id`)).toBe('');
    expect(() =>
      as(
        playerA,
        `INSERT INTO payments (id, club_id, concept, amount_cents, updated_at)
                    VALUES ('${id()}','${A.id}','deposit',1,now())`,
      ),
    ).toThrow(/row-level security/);
  });

  it('a coach sees only the matches and lessons they teach', () => {
    expect(as(coachA, `SELECT id FROM matches`)).toBe(A.match);
    expect(
      count({ role: 'coach', user: B.coach, club: B.id }, 'matches', `id = '${A.match}'`),
    ).toBe(0);
    expect(count({ role: 'coach', user: outsider, club: A.id }, 'matches')).toBe(0);
  });

  it('support sees technical data of any club but no personal data or video', () => {
    expect(count(supportCtx, 'devices')).toBe(2);
    expect(count(supportCtx, 'matches')).toBe(2);
    expect(count(supportCtx, 'media_assets')).toBe(0);
    expect(count(supportCtx, 'payments')).toBe(0);
    expect(count(supportCtx, 'clips')).toBe(0);
  });

  it('support opens a video only with a fresh audit_log grant', () => {
    psql(
      url,
      `INSERT INTO audit_log (id, club_id, actor_user_id, action, entity_type, entity_id)
       VALUES ('${id()}','${A.id}','${support}','video.access_granted','media_asset','${A.asset}')`,
    );
    expect(as(supportCtx, `SELECT id FROM media_assets`)).toBe(A.asset);
    // An expired grant (2 h old) opens nothing.
    psql(
      url,
      `INSERT INTO audit_log (id, club_id, actor_user_id, action, entity_type, entity_id, created_at)
       VALUES ('${id()}','${B.id}','${support}','video.access_granted','media_asset','${B.asset}', now() - interval '2 hours')`,
    );
    expect(count(supportCtx, 'media_assets', `id = '${B.asset}'`)).toBe(0);
    expect(count(supportCtx, 'media_assets', `id = '${A.asset}'`)).toBe(1);
  });

  it('audit_log is append-only for the runtime and club-scoped on read', () => {
    expect(count(ownerA, 'audit_log', `club_id = '${B.id}'`)).toBe(0);
    expect(count(staffA, 'audit_log')).toBe(0);
    expect(() => as(supportCtx, `UPDATE audit_log SET action = 'y'`)).toThrow(/permission denied/);
    expect(() => as(supportCtx, `DELETE FROM audit_log`)).toThrow(/permission denied/);
  });

  it('settlements are readable only by the own club owner', () => {
    psql(
      url,
      `INSERT INTO settlements (id, club_id, period_start, period_end, updated_at) VALUES
        ('${id()}','${A.id}','2026-10-01','2026-10-31',now()),('${id()}','${B.id}','2026-10-01','2026-10-31',now())`,
    );
    expect(count(ownerA, 'settlements')).toBe(1);
    expect(count(staffA, 'settlements')).toBe(0);
    expect(count(supportCtx, 'settlements')).toBe(0);
  });

  it('clubs: players see the directory, club roles only their club', () => {
    expect(count(playerA, 'clubs')).toBe(2);
    expect(count(staffA, 'clubs')).toBe(1);
    expect(count(ownerA, 'clubs', `id = '${B.id}'`)).toBe(0);
  });

  it('does not leave a club table without a policy', () => {
    const none = psql(
      url,
      `SELECT string_agg(c.relname, ',') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
          AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)`,
    );
    expect(none).toBe('');
    expect(clubTables.length).toBeGreaterThan(0);
  });
});
