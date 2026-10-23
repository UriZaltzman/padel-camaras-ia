import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const prismaDir = join(__dirname, '..', 'prisma');

// Spec §2: 22 tables in 6 areas + 5 technical ones, plus `booking_rule_price_bands`
// (the price bands of a booking rule, added with the bookings schema).
const EXPECTED_TABLES = [
  'users',
  'auth_identities',
  'memberships',
  'clubs',
  'club_modules',
  'court_blocks',
  'club_player_notes',
  'tournaments',
  'tournament_groups',
  'tournament_registrations',
  'tournament_matches',
  'tournament_points',
  'courts',
  'contracts',
  'devices',
  'cameras',
  'calibrations',
  'booking_slots_rules',
  'booking_rule_price_bands',
  'bookings',
  'booking_players',
  'matches',
  'match_players',
  'points',
  'shots',
  'match_stats',
  'insights',
  'media_assets',
  'clips',
  'payments',
  'settlements',
  'ratings',
  'lessons',
  'lesson_students',
  'lesson_notes',
  'lesson_requests',
  'coach_access_grants',
  'notifications',
  'audit_log',
  'processing_jobs',
].sort();

describe('database tables', () => {
  it('schema.prisma maps exactly the expected tables', () => {
    const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
    const mapped = [...schema.matchAll(/^model \w+ \{[\s\S]*?@@map\("(\w+)"\)/gm)].map((m) => m[1]);
    expect(mapped.sort()).toEqual(EXPECTED_TABLES);
  });

  it('migrations create exactly the expected tables', () => {
    const dir = join(prismaDir, 'migrations');
    const created = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .flatMap(
        (e) =>
          readFileSync(join(dir, e.name, 'migration.sql'), 'utf8').match(
            /^CREATE TABLE "(\w+)"/gm,
          ) ?? [],
      )
      .map((l) => l.replace(/^CREATE TABLE "(\w+)"/, '$1'));
    expect(created.sort()).toEqual(EXPECTED_TABLES);
  });
});
