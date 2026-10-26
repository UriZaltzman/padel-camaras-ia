import type { Prisma } from '@prisma/client';
import { seedId } from './ids';

/**
 * Fictional test clubs of docs/pendientes.md (Club Demo Palermo, Quilmes and Pilar). Everything
 * here is invented: names, phones (reserved 555 block) and emails (example.com). Pure functions:
 * the same `today` always gives the same rows, with the same ids.
 */

/** Element `index` of a non-empty list, wrapping around (so a short list still fills a long loop). */
function pick<T>(list: readonly T[], index: number): T {
  const item = list[index % list.length];
  if (item === undefined) throw new Error('pick() on an empty list');
  return item;
}

export const TIMEZONE_OFFSET_HOURS = 3; // America/Argentina/Buenos_Aires is UTC-3, no daylight saving.
export const PLAYERS_PER_CLUB = 24;
export const MATCHES_PER_CLUB = 30;

export type Category = 'cat_8' | 'cat_7' | 'cat_6' | 'cat_5' | 'cat_4' | 'cat_3';
const CATEGORIES: Category[] = ['cat_8', 'cat_7', 'cat_6', 'cat_5', 'cat_4', 'cat_3'];

interface ClubSpec {
  key: 'palermo' | 'quilmes' | 'pilar';
  index: number;
  id: string;
  name: string;
  address: string;
  cuit: string;
  plan: 'loan' | 'purchase';
  courts: { name: string; covered: boolean }[];
  /** Price of 60 minutes before 18:00, ARS cents; 90 and 120 minutes scale from it. */
  basePriceCents: number;
  /**
   * Club-level deposit the checkout charges (`clubs.deposit_cents`). Kept equal to the fixed
   * deposit of the booking rules so the amount a booking shows is the amount the checkout asks.
   */
  clubDepositCents: number | null;
  /** Deposit rule per court (by position). */
  deposit: (
    courtIndex: number,
  ) => { kind: 'none' } | { kind: 'fixed'; amountCents: number } | { kind: 'percent'; bps: number };
}

export const CLUBS: readonly ClubSpec[] = [
  {
    key: 'palermo',
    index: 1,
    // Same ids as the web mock (apps/web/src/lib/api/mock-data.ts), so mock and real data agree.
    id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60',
    name: 'Club Demo Palermo',
    address: 'Av. Santa Fe 4000, CABA',
    cuit: '30999999011',
    plan: 'loan',
    courts: [
      { name: 'Cancha 1', covered: true },
      { name: 'Cancha 2', covered: true },
      { name: 'Cancha 3', covered: false },
      { name: 'Cancha 4', covered: false },
    ],
    basePriceCents: 1_600_000,
    clubDepositCents: 800_000,
    deposit: () => ({ kind: 'fixed', amountCents: 800_000 }),
  },
  {
    key: 'quilmes',
    index: 2,
    id: seedId('club:quilmes'),
    name: 'Club Demo Quilmes',
    address: 'Av. Calchaquí 1200, Quilmes, Buenos Aires',
    cuit: '30999999022',
    plan: 'purchase',
    courts: [
      { name: 'Cancha 1', covered: false },
      { name: 'Cancha 2', covered: false },
    ],
    basePriceCents: 1_000_000,
    clubDepositCents: 500_000,
    deposit: () => ({ kind: 'fixed', amountCents: 500_000 }),
  },
  {
    key: 'pilar',
    index: 3,
    id: seedId('club:pilar'),
    name: 'Club Demo Pilar',
    address: 'Ruta 8 km 50, Pilar, Buenos Aires',
    cuit: '30999999033',
    plan: 'loan',
    courts: [1, 2, 3, 4, 5, 6].map((n) => ({ name: `Cancha ${n}`, covered: n <= 2 })),
    basePriceCents: 1_200_000,
    clubDepositCents: null,
    deposit: (courtIndex) => (courtIndex < 3 ? { kind: 'none' } : { kind: 'percent', bps: 5000 }),
  },
];

/** Court ids: Palermo's first two match the web mock; the rest are derived. */
export function courtId(club: ClubSpec, courtIndex: number): string {
  if (club.key === 'palermo' && courtIndex === 0) return '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a61';
  if (club.key === 'palermo' && courtIndex === 1) return '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a62';
  return seedId(`court:${club.key}:${courtIndex}`);
}

const FIRST_NAMES = [
  'Lucía',
  'Martín',
  'Sofía',
  'Mateo',
  'Valentina',
  'Tomás',
  'Camila',
  'Joaquín',
  'Julieta',
  'Nicolás',
  'Agustina',
  'Facundo',
  'Florencia',
  'Santiago',
  'Micaela',
  'Bruno',
  'Candela',
  'Franco',
  'Rocío',
  'Ignacio',
  'Milagros',
  'Lautaro',
  'Abril',
  'Gonzalo',
];
const LAST_NAMES = [
  'Pérez',
  'Gómez',
  'Rodríguez',
  'Fernández',
  'López',
  'Díaz',
  'Martínez',
  'Romero',
  'Sosa',
  'Álvarez',
  'Torres',
  'Ruiz',
  'Ramírez',
  'Flores',
  'Acosta',
  'Benítez',
  'Medina',
  'Herrera',
  'Suárez',
  'Aguirre',
  'Giménez',
  'Molina',
  'Silva',
  'Castro',
];

export interface PersonSpec {
  id: string;
  clubKey: ClubSpec['key'];
  role: 'owner' | 'staff' | 'coach' | 'player';
  name: string;
  phone: string;
  email: string;
  category: Category | null;
}

/** `slot`: 1 owner, 2 staff, 3-4 coaches, 11-34 players. Phones are in the fictional 555 block. */
export function phoneOf(club: ClubSpec, slot: number): string {
  return `+549115550${club.index}${String(slot).padStart(3, '0')}`;
}

export function peopleOf(club: ClubSpec): PersonSpec[] {
  const make = (
    slot: number,
    role: PersonSpec['role'],
    name: string,
    label: string,
    category: Category | null,
  ): PersonSpec => ({
    id: seedId(`user:${club.key}:${slot}`),
    clubKey: club.key,
    role,
    name,
    phone: phoneOf(club, slot),
    email: `${label}.${club.key}@example.com`,
    category,
  });
  const people: PersonSpec[] = [
    make(1, 'owner', `Dueño ${club.name}`, 'owner', null),
    make(2, 'staff', `Recepción ${club.name}`, 'staff', null),
    make(3, 'coach', `Profe Ana ${club.name.split(' ').pop() ?? ''}`, 'coach1', 'cat_3'),
    make(4, 'coach', `Profe Beto ${club.name.split(' ').pop() ?? ''}`, 'coach2', 'cat_3'),
  ];
  for (let i = 0; i < PLAYERS_PER_CLUB; i += 1) {
    const offset = (club.index - 1) * 7;
    people.push(
      make(
        11 + i,
        'player',
        `${FIRST_NAMES[(i + offset) % FIRST_NAMES.length]} ${LAST_NAMES[(i * 5 + offset) % LAST_NAMES.length]}`,
        `player${String(i + 1).padStart(2, '0')}`,
        CATEGORIES[i % CATEGORIES.length] ?? 'cat_8',
      ),
    );
  }
  return people;
}

export function playersOf(club: ClubSpec): PersonSpec[] {
  return peopleOf(club).filter((p) => p.role === 'player');
}

// ---------------------------------------------------------------- Time helpers

/** `YYYY-MM-DD` of today in Buenos Aires, or `SEED_TODAY` when set (for reproducible runs). */
export function localToday(env: Record<string, string | undefined>, now = new Date()): string {
  const fixed = env.SEED_TODAY;
  if (fixed) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fixed)) throw new Error('SEED_TODAY must be YYYY-MM-DD');
    return fixed;
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    now,
  );
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Local Buenos Aires wall time to the instant, in UTC. */
export function localInstant(date: string, hour: number, minute = 0): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, hour + TIMEZONE_OFFSET_HOURS, minute));
}

export function timeOfDay(hour: number, minute = 0): Date {
  return new Date(Date.UTC(1970, 0, 1, hour, minute));
}

// ---------------------------------------------------------------- Prices

const DURATIONS = [60, 90, 120] as const;
const DURATION_FACTOR: Record<number, number> = { 60: 1, 90: 1.5, 120: 2 };

/** Price of a slot by the band its start falls in: before 18:00 off-peak, from 18:00 peak (+25%). */
export function priceCents(club: ClubSpec, startHour: number, duration: number): number {
  const peak = startHour >= 18 ? 1.25 : 1;
  return Math.round(club.basePriceCents * (DURATION_FACTOR[duration] ?? 1) * peak);
}

// ---------------------------------------------------------------- Rows

export interface SeedRows {
  users: Prisma.UserCreateManyInput[];
  authIdentities: Prisma.AuthIdentityCreateManyInput[];
  clubs: Prisma.ClubCreateManyInput[];
  clubModules: Prisma.ClubModulesCreateManyInput[];
  memberships: Prisma.MembershipCreateManyInput[];
  courts: Prisma.CourtCreateManyInput[];
  contracts: Prisma.ContractCreateManyInput[];
  rules: Prisma.BookingSlotsRuleCreateManyInput[];
  bands: Prisma.BookingRulePriceBandCreateManyInput[];
  bookings: Prisma.BookingCreateManyInput[];
  bookingPlayers: Prisma.BookingPlayerCreateManyInput[];
  matches: Prisma.MatchCreateManyInput[];
  matchPlayers: Prisma.MatchPlayerCreateManyInput[];
  tournaments: Prisma.TournamentCreateManyInput[];
  tournamentRegistrations: Prisma.TournamentRegistrationCreateManyInput[];
}

const ACCEPTED_AT = new Date('2026-01-01T12:00:00Z');
const TERMS_VERSION = '2026-01';
const SCORES: { team_1: number; team_2: number; tiebreak: null }[][] = [
  [
    { team_1: 6, team_2: 4, tiebreak: null },
    { team_1: 6, team_2: 3, tiebreak: null },
  ],
  [
    { team_1: 4, team_2: 6, tiebreak: null },
    { team_1: 6, team_2: 2, tiebreak: null },
    { team_1: 3, team_2: 6, tiebreak: null },
  ],
  [
    { team_1: 7, team_2: 5, tiebreak: null },
    { team_1: 6, team_2: 7, tiebreak: null },
    { team_1: 6, team_2: 4, tiebreak: null },
  ],
  [
    { team_1: 2, team_2: 6, tiebreak: null },
    { team_1: 4, team_2: 6, tiebreak: null },
  ],
];

function winnerOf(sets: { team_1: number; team_2: number }[]): 1 | 2 {
  const team1 = sets.filter((s) => s.team_1 > s.team_2).length;
  return team1 > sets.length - team1 ? 1 : 2;
}

export function buildSeed(today: string): SeedRows {
  const rows: SeedRows = {
    users: [],
    authIdentities: [],
    clubs: [],
    clubModules: [],
    memberships: [],
    courts: [],
    contracts: [],
    rules: [],
    bands: [],
    bookings: [],
    bookingPlayers: [],
    matches: [],
    matchPlayers: [],
    tournaments: [],
    tournamentRegistrations: [],
  };

  for (const club of CLUBS) {
    rows.clubs.push({
      id: club.id,
      name: club.name,
      address: club.address,
      cuit: club.cuit,
      plan: club.plan,
      depositCents: club.clubDepositCents,
      playerHorizonDays: 14,
    });
    rows.contracts.push({
      id: seedId(`contract:${club.key}`),
      clubId: club.id,
      plan: club.plan,
      feePerCourtAmountCents: club.plan === 'loan' ? 10_000_000 : 0,
      startsOn: new Date('2026-01-01T00:00:00Z'),
      minimumMonths: 12,
      commissionBps: 1500,
    });
    if (club.key === 'palermo') {
      rows.clubModules.push({ clubId: club.id, tournaments: true });
    }

    const people = peopleOf(club);
    for (const p of people) {
      rows.users.push({
        id: p.id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        declaredCategory: p.category,
        termsAcceptedAt: ACCEPTED_AT,
        termsVersion: TERMS_VERSION,
        privacyAcceptedAt: ACCEPTED_AT,
        privacyVersion: TERMS_VERSION,
      });
      rows.authIdentities.push({
        id: seedId(`identity:${p.id}`),
        userId: p.id,
        provider: 'whatsapp',
        externalId: p.phone,
      });
      rows.memberships.push({
        id: seedId(`membership:${p.id}:${p.role}`),
        clubId: club.id,
        userId: p.id,
        role: p.role,
        status: 'active',
      });
    }

    club.courts.forEach((court, index) => {
      const cid = courtId(club, index);
      rows.courts.push({ id: cid, clubId: club.id, name: court.name, covered: court.covered });
      const ruleId = seedId(`rule:${club.key}:${index}`);
      const deposit = club.deposit(index);
      rows.rules.push({
        id: ruleId,
        clubId: club.id,
        courtId: cid,
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        opensAt: timeOfDay(8),
        closesAt: timeOfDay(0), // 00:00 = closes at midnight
        allowedDurationsMinutes: [...DURATIONS],
        startIntervalMinutes: 30,
        depositKind: deposit.kind,
        depositAmountCents: deposit.kind === 'fixed' ? deposit.amountCents : null,
        depositBps: deposit.kind === 'percent' ? deposit.bps : null,
        cancellationHours: 24,
      });
      for (const [startHour, endHour] of [
        [8, 18],
        [18, 24],
      ] as const) {
        for (const duration of DURATIONS) {
          rows.bands.push({
            id: seedId(`band:${club.key}:${index}:${startHour}:${duration}`),
            clubId: club.id,
            ruleId,
            startsAt: timeOfDay(startHour),
            endsAt: timeOfDay(endHour % 24),
            durationMinutes: duration,
            priceCents: priceCents(club, startHour, duration),
          });
        }
      }
    });

    addBookings(rows, club, today);
    if (club.key === 'palermo') addTournament(rows, club, today);
  }
  return rows;
}

function depositOf(club: ClubSpec, courtIndex: number, price: number): number {
  const d = club.deposit(courtIndex);
  if (d.kind === 'fixed') return d.amountCents;
  if (d.kind === 'percent') return Math.round((price * d.bps) / 10_000);
  return 0;
}

function addBookings(rows: SeedRows, club: ClubSpec, today: string): void {
  const players = playersOf(club);
  const courtCount = club.courts.length;

  // 30 played matches on past days: completed booking + published match with a coherent score.
  for (let n = 1; n <= MATCHES_PER_CLUB; n += 1) {
    const date = addDays(today, -n);
    const courtIndex = n % courtCount;
    const duration = DURATIONS[n % DURATIONS.length] ?? 90;
    const startHour = 18 + (n % 3); // 18:00, 19:00, 20:00
    const startsAt = localInstant(date, startHour);
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    const four = [0, 1, 2, 3].map((k) => pick(players, n * 4 + k));
    const price = priceCents(club, startHour, duration);
    const bookingId = seedId(`booking:${club.key}:past:${n}`);
    rows.bookings.push({
      id: bookingId,
      clubId: club.id,
      courtId: courtId(club, courtIndex),
      startsAt,
      endsAt,
      status: 'completed',
      priceCents: price,
      depositPaidCents: depositOf(club, courtIndex, price),
      origin: 'app',
      createdByUserId: pick(four, 0).id,
    });
    four.forEach((p, k) => {
      rows.bookingPlayers.push({
        id: seedId(`bplayer:${bookingId}:${k}`),
        clubId: club.id,
        bookingId,
        position: k + 1,
        userId: p.id,
        accepted: true,
        acceptedAt: startsAt,
      });
    });
    const sets = pick(SCORES, n);
    const matchId = seedId(`match:${club.key}:${n}`);
    rows.matches.push({
      id: matchId,
      clubId: club.id,
      courtId: courtId(club, courtIndex),
      bookingId,
      type: 'match',
      status: 'published',
      startsAt,
      endsAt,
      finalScore: sets,
      winnerTeam: winnerOf(sets),
      modelVersion: '2026.10.1',
    });
    four.forEach((p, k) => {
      rows.matchPlayers.push({
        id: seedId(`mplayer:${matchId}:${k}`),
        clubId: club.id,
        matchId,
        userId: p.id,
        team: k < 2 ? 1 : 2,
        initialSide: k % 2 === 0 ? 'a' : 'b',
        trackIndex: k,
        confirmed: true,
        confirmedAt: endsAt,
      });
    });
  }

  // Upcoming turns with mixed durations, in the evening so mornings stay free for the e2e tests.
  for (let n = 1; n <= 6; n += 1) {
    const date = addDays(today, n);
    for (const [slot, startHour, startMinute] of [
      [0, 19, 0],
      [1, 20, 30],
    ] as const) {
      // Two different courts per day, so the two turns can never overlap.
      const courtIndex = (n + slot) % courtCount;
      const duration = DURATIONS[(n + slot) % DURATIONS.length] ?? 90;
      const startsAt = localInstant(date, startHour, startMinute);
      const price = priceCents(club, startHour, duration);
      const booker = pick(players, n * 2 + slot);
      const bookingId = seedId(`booking:${club.key}:future:${n}:${slot}`);
      const finalCourt = courtIndex;
      rows.bookings.push({
        id: bookingId,
        clubId: club.id,
        courtId: courtId(club, finalCourt),
        startsAt,
        endsAt: new Date(startsAt.getTime() + duration * 60_000),
        status: 'confirmed',
        priceCents: price,
        depositPaidCents: depositOf(club, finalCourt, price),
        origin: slot === 0 ? 'app' : 'panel',
        createdByUserId: booker.id,
      });
      rows.bookingPlayers.push({
        id: seedId(`bplayer:${bookingId}:0`),
        clubId: club.id,
        bookingId,
        position: 1,
        userId: booker.id,
        accepted: true,
        acceptedAt: startsAt,
      });
    }
  }

  // One cancelled turn, so the calendar has a state that does not occupy the court.
  const cancelledId = seedId(`booking:${club.key}:cancelled`);
  const cancelledStart = localInstant(addDays(today, 2), 17);
  rows.bookings.push({
    id: cancelledId,
    clubId: club.id,
    courtId: courtId(club, 0),
    startsAt: cancelledStart,
    endsAt: new Date(cancelledStart.getTime() + 90 * 60_000),
    status: 'cancelled',
    priceCents: priceCents(club, 17, 90),
    origin: 'app',
    cancelledAt: addDaysInstant(cancelledStart, -1),
    createdByUserId: pick(players, 0).id,
  });
}

function addDaysInstant(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 3600 * 1000);
}

function addTournament(rows: SeedRows, club: ClubSpec, today: string): void {
  const players = playersOf(club);
  const tournamentId = seedId(`tournament:${club.key}`);
  rows.tournaments.push({
    id: tournamentId,
    clubId: club.id,
    name: 'Torneo Demo Palermo 5ta',
    category: 5,
    status: 'registration',
    entryFeeCents: 800_000,
    matchMinutes: 90,
    pointsConfig: { champion: 100, finalist: 60, semifinal: 40, quarterfinal: 20, group_win: 10 },
    createdByUserId: pick(peopleOf(club), 0).id,
  });
  // Four pairs from the 5ta players (index 3 of each 6-category cycle), two of them paid.
  const fifth = players.filter((p) => p.category === 'cat_5' || p.category === 'cat_4');
  for (let i = 0; i < 4; i += 1) {
    const p1 = pick(fifth, i * 2);
    const p2 = pick(fifth, i * 2 + 1);
    if (p1.id === p2.id) continue;
    rows.tournamentRegistrations.push({
      id: seedId(`registration:${club.key}:${i}`),
      clubId: club.id,
      tournamentId,
      player1UserId: p1.id,
      player2UserId: p2.id,
      paid: i < 2,
      paidAt: i < 2 ? localInstant(today, 10) : null,
      createdByUserId: p1.id,
    });
  }
}
