import { PrismaClient } from '@prisma/client';
import { buildSeed, localToday, type SeedRows } from './data';
import { seedCredentials } from './credentials';
import { assertSeedAllowed } from './guard';

interface Delegate {
  createMany(args: { data: never[]; skipDuplicates: boolean }): Promise<{ count: number }>;
}

/**
 * Loads the three test clubs. Safe to repeat: every row has a fixed id and is inserted with
 * `skipDuplicates`, so a second run changes nothing. Refuses to run against production.
 */
export async function runSeed(
  env: Record<string, string | undefined> = process.env,
  log: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Promise<SeedRows> {
  assertSeedAllowed(env);
  const rows = buildSeed(localToday(env));
  const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  try {
    // Order follows the foreign keys.
    const plan: [string, Delegate, unknown[]][] = [
      ['users', prisma.user as unknown as Delegate, rows.users],
      ['auth_identities', prisma.authIdentity as unknown as Delegate, rows.authIdentities],
      ['clubs', prisma.club as unknown as Delegate, rows.clubs],
      ['club_modules', prisma.clubModules as unknown as Delegate, rows.clubModules],
      ['memberships', prisma.membership as unknown as Delegate, rows.memberships],
      ['courts', prisma.court as unknown as Delegate, rows.courts],
      ['contracts', prisma.contract as unknown as Delegate, rows.contracts],
      ['booking_slots_rules', prisma.bookingSlotsRule as unknown as Delegate, rows.rules],
      ['booking_rule_price_bands', prisma.bookingRulePriceBand as unknown as Delegate, rows.bands],
      ['bookings', prisma.booking as unknown as Delegate, rows.bookings],
      ['booking_players', prisma.bookingPlayer as unknown as Delegate, rows.bookingPlayers],
      ['matches', prisma.match as unknown as Delegate, rows.matches],
      ['match_players', prisma.matchPlayer as unknown as Delegate, rows.matchPlayers],
      ['tournaments', prisma.tournament as unknown as Delegate, rows.tournaments],
      [
        'tournament_registrations',
        prisma.tournamentRegistration as unknown as Delegate,
        rows.tournamentRegistrations,
      ],
    ];
    for (const [table, delegate, data] of plan) {
      const result = await delegate.createMany({ data: data as never[], skipDuplicates: true });
      log(`seed ${table}: ${result.count} new of ${data.length}`);
    }
    // The password login (#343) fills `seedCredentials()`; today it is empty on purpose.
    for (const credential of seedCredentials()) {
      log(`seed credential for ${credential.email}: handled by the password login`);
    }
    return rows;
  } finally {
    await prisma.$disconnect();
  }
}
