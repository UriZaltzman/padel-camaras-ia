import { PrismaClient } from '@prisma/client';
import { buildSeed, localToday, type SeedRows } from './data';
import { seedCredentials } from './credentials';
import { assertSeedAllowed } from './guard';
import { seedId } from './ids';

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
    // Dev logins of owners and receptionists: email identity + Argon2id credential (#343).
    const credentials = await seedCredentials(env);
    const identities = await prisma.authIdentity.createMany({
      data: credentials.map((c) => ({
        id: seedId(`identity:email:${c.userId}`),
        userId: c.userId,
        provider: 'email' as const,
        externalId: c.email,
      })),
      skipDuplicates: true,
    });
    const hashes = await prisma.userCredential.createMany({
      data: credentials.map((c) => ({
        userId: c.userId,
        passwordHash: c.passwordHash,
        pepperVersion: c.pepperVersion,
      })),
      skipDuplicates: true,
    });
    log(`seed email identities: ${identities.count} new of ${credentials.length}`);
    log(`seed user_credentials: ${hashes.count} new of ${credentials.length}`);
    return rows;
  } finally {
    await prisma.$disconnect();
  }
}
