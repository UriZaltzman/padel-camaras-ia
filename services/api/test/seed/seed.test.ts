import { describe, expect, it } from 'vitest';
import {
  CLUBS,
  MATCHES_PER_CLUB,
  PLAYERS_PER_CLUB,
  buildSeed,
  type SeedRows,
} from '../../src/seed/data';
import { seedCredentials } from '../../src/seed/credentials';
import { assertSeedAllowed, SeedNotAllowedError } from '../../src/seed/guard';
import { seedId } from '../../src/seed/ids';

const TODAY = '2026-10-26';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function allIds(rows: SeedRows): string[] {
  return Object.entries(rows)
    .filter(([name]) => name !== 'clubModules')
    .flatMap(([, list]) => (list as { id: string }[]).map((r) => r.id));
}

describe('seed data', () => {
  const rows = buildSeed(TODAY);

  it('is deterministic: the same day gives the same rows', () => {
    expect(JSON.stringify(buildSeed(TODAY))).toBe(JSON.stringify(rows));
  });

  it('uses unique UUID v7 shaped ids', () => {
    const ids = allIds(rows);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(UUID_V7);
    expect(seedId('a')).toBe(seedId('a'));
    expect(seedId('a')).not.toBe(seedId('b'));
  });

  it('has the three clubs with their courts and the people of docs/pendientes.md', () => {
    expect(rows.clubs.map((c) => c.name)).toEqual([
      'Club Demo Palermo',
      'Club Demo Quilmes',
      'Club Demo Pilar',
    ]);
    expect(rows.courts.length).toBe(4 + 2 + 6);
    for (const club of CLUBS) {
      const members = rows.memberships.filter((m) => m.clubId === club.id);
      const count = (role: string) => members.filter((m) => m.role === role).length;
      expect([count('owner'), count('staff'), count('coach'), count('player')]).toEqual([
        1,
        1,
        2,
        PLAYERS_PER_CLUB,
      ]);
      expect(rows.matches.filter((m) => m.clubId === club.id)).toHaveLength(MATCHES_PER_CLUB);
    }
  });

  it('gives every user a unique phone in E.164 and an example.com email', () => {
    const phones = rows.users.map((u) => u.phone);
    expect(new Set(phones).size).toBe(phones.length);
    for (const phone of phones) expect(phone).toMatch(/^\+[1-9]\d{7,14}$/);
    for (const user of rows.users) expect(user.email).toMatch(/@example\.com$/);
  });

  it('offers 60, 90 and 120 minutes on a 30 minute grid with prices per band', () => {
    for (const rule of rows.rules) {
      expect(rule.allowedDurationsMinutes).toEqual([60, 90, 120]);
      expect(rule.startIntervalMinutes).toBe(30);
    }
    for (const rule of rows.rules) {
      const bands = rows.bands.filter((b) => b.ruleId === rule.id);
      expect(bands).toHaveLength(6); // 2 bands x 3 durations
    }
  });

  it('mixes booking durations and never overlaps two live bookings on a court', () => {
    const live = rows.bookings.filter((b) => b.status !== 'cancelled');
    const durations = new Set(
      live.map((b) => (new Date(b.endsAt).getTime() - new Date(b.startsAt).getTime()) / 60_000),
    );
    expect([...durations].sort((a, b) => a - b)).toEqual([60, 90, 120]);
    for (const a of live) {
      for (const b of live) {
        if (a.id >= b.id || a.courtId !== b.courtId) continue;
        const overlap =
          new Date(a.startsAt).getTime() < new Date(b.endsAt).getTime() &&
          new Date(b.startsAt).getTime() < new Date(a.endsAt).getTime();
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('keeps match scores coherent with the winner', () => {
    for (const match of rows.matches) {
      const sets = match.finalScore as { team_1: number; team_2: number }[];
      const team1 = sets.filter((s) => s.team_1 > s.team_2).length;
      expect(match.winnerTeam).toBe(team1 > sets.length - team1 ? 1 : 2);
    }
  });

  it('leaves the morning free so e2e tests can book there', () => {
    for (const booking of rows.bookings) {
      const localHour = new Date(booking.startsAt).getUTCHours() - 3;
      expect(localHour).toBeGreaterThanOrEqual(17);
    }
  });

  it('has no credentials until the password login fills the hook', () => {
    expect(seedCredentials()).toEqual([]);
  });
});

describe('seed guard', () => {
  it('refuses production and remote databases', () => {
    const local = 'postgresql://app:app@localhost:5432/app';
    expect(() => assertSeedAllowed({ NODE_ENV: 'development', DATABASE_URL: local })).not.toThrow();
    expect(() => assertSeedAllowed({ NODE_ENV: 'production', DATABASE_URL: local })).toThrow(
      SeedNotAllowedError,
    );
    expect(() => assertSeedAllowed({ DATABASE_URL: 'postgresql://u@db.example.com/app' })).toThrow(
      SeedNotAllowedError,
    );
    expect(() =>
      assertSeedAllowed({
        DATABASE_URL: 'postgresql://u@db.example.com/app',
        SEED_ALLOW_REMOTE: '1',
      }),
    ).not.toThrow();
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: 'production',
        DATABASE_URL: local,
        SEED_ALLOW_REMOTE: '1',
      }),
    ).toThrow(SeedNotAllowedError);
    expect(() => assertSeedAllowed({})).toThrow(SeedNotAllowedError);
  });
});
