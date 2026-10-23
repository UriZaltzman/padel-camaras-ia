import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { DbContext } from '../db/db-context';
import { newId } from '../db/ids';
import { PrismaService, type Tx } from '../db/prisma.service';
import { AppError } from '../errors/app-error';
import {
  WEEKDAYS,
  type BookingRule,
  type ClubDto,
  type ClubSettingsUpdate,
  type ClubSummaryDto,
  type CourtBookingSettings,
  type CourtDto,
  type Deposit,
  type PriceBand,
} from './club-model';
import { ClubsRepository, type SettingsAudit } from './clubs.repository';

// Public reads act as an anonymous player: the directory is readable by players (RLS).
const PUBLIC: DbContext = { role: 'player' };

export const COURT_INCLUDE = {
  courts: {
    orderBy: { name: 'asc' },
    include: {
      bookingSlotsRules: {
        where: { active: true },
        orderBy: { opensAt: 'asc' },
        include: { priceBands: { orderBy: [{ startsAt: 'asc' }, { durationMinutes: 'asc' }] } },
      },
    },
  },
} satisfies Prisma.ClubInclude;

type ClubRow = Prisma.ClubGetPayload<{ include: typeof COURT_INCLUDE }>;
export type CourtRow = ClubRow['courts'][number];
export type RuleRow = CourtRow['bookingSlotsRules'][number];

/** `time` columns carry no date; 24:00 is stored as 00:00 and read back as 24:00 for end times. */
export function toDbTime(local: string): Date {
  const [h = 0, m = 0] = local.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, h % 24, m));
}
export function fromDbTime(value: Date, isEnd: boolean): string {
  const hh = String(value.getUTCHours()).padStart(2, '0');
  const mm = String(value.getUTCMinutes()).padStart(2, '0');
  return isEnd && hh === '00' && mm === '00' ? '24:00' : `${hh}:${mm}`;
}

export function depositOf(rule: RuleRow | undefined): Deposit {
  if (!rule || rule.depositKind === 'none') return { type: 'none' };
  if (rule.depositKind === 'fixed') {
    return { type: 'fixed', amount_cents: rule.depositAmountCents ?? 0 };
  }
  return { type: 'percent', percent: Math.round((rule.depositBps ?? 0) / 100) };
}

export function toRule(rule: RuleRow): BookingRule {
  const bands = new Map<string, PriceBand>();
  for (const row of rule.priceBands) {
    const starts = fromDbTime(row.startsAt, false);
    const ends = fromDbTime(row.endsAt, true);
    const band = bands.get(`${starts}-${ends}`) ?? { starts_at: starts, ends_at: ends, prices: [] };
    band.prices.push({
      duration_minutes: row.durationMinutes as 60 | 90 | 120,
      amount_cents: row.priceCents,
    });
    bands.set(`${starts}-${ends}`, band);
  }
  return {
    days: rule.daysOfWeek.map((d) => WEEKDAYS[d - 1] as (typeof WEEKDAYS)[number]),
    opens_at: fromDbTime(rule.opensAt, false),
    closes_at: fromDbTime(rule.closesAt, true),
    allowed_durations: rule.allowedDurationsMinutes as (60 | 90 | 120)[],
    start_interval_minutes: rule.startIntervalMinutes as 15 | 30 | 60,
    price_bands: [...bands.values()],
  };
}

function toCourt(court: CourtRow): CourtDto {
  const first = court.bookingSlotsRules[0];
  const booking: CourtBookingSettings = {
    rules: court.bookingSlotsRules.map(toRule),
    deposit: depositOf(first),
    cancellation_refund_hours: first?.cancellationHours ?? 24,
  };
  return { id: court.id, name: court.name, covered: court.covered, status: court.status, booking };
}

function toClub(club: ClubRow): ClubDto {
  return {
    id: club.id,
    name: club.name,
    address: club.address ?? '',
    // The schema has no city yet, nor coach plan or lesson payments: see the hand-over notes.
    city: '',
    timezone: club.timezone,
    logo_url: club.logoUrl,
    sponsor_name: club.sponsorName,
    plan: club.plan,
    courts: club.courts.map(toCourt),
    charges: {
      player_extra: {
        enabled: club.playerExtraPriceCents !== null,
        amount_cents: club.playerExtraPriceCents,
      },
      coach_plan: { type: 'included' },
      lesson_payments_enabled: false,
    },
  };
}

@Injectable()
export class PrismaClubsRepository extends ClubsRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  async listSummaries(): Promise<ClubSummaryDto[]> {
    const rows = await this.db.run(PUBLIC, (tx) =>
      tx.club.findMany({
        select: {
          id: true,
          name: true,
          address: true,
          logoUrl: true,
          _count: { select: { courts: { where: { status: { not: 'inactive' } } } } },
        },
      }),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address ?? '',
      city: '',
      logo_url: row.logoUrl,
      courts_count: row._count.courts,
    }));
  }

  async findById(id: string): Promise<ClubDto | null> {
    const row = await this.db.run(PUBLIC, (tx) => this.load(tx, id));
    return row ? toClub(row) : null;
  }

  async updateSettings(
    ctx: DbContext,
    clubId: string,
    update: ClubSettingsUpdate,
    audit: SettingsAudit,
  ): Promise<ClubDto> {
    return this.db.run(ctx, async (tx) => {
      const before = await this.load(tx, clubId);
      if (!before) throw new AppError('NOT_FOUND');
      const owned = new Set(before.courts.map((court) => court.id));
      if ((update.courts ?? []).some((court) => !owned.has(court.court_id))) {
        throw new AppError('NOT_FOUND');
      }

      if (update.charges) {
        const { player_extra } = update.charges;
        await tx.club.update({
          where: { id: clubId },
          data: { playerExtraPriceCents: player_extra.enabled ? player_extra.amount_cents : null },
        });
      }
      for (const court of update.courts ?? []) {
        await this.replaceRules(tx, clubId, court.court_id, court.booking);
      }

      const after = await this.load(tx, clubId);
      if (!after) throw new AppError('NOT_FOUND');
      await tx.auditLog.create({
        data: {
          id: newId(),
          clubId,
          actorUserId: audit.actorUserId,
          action: 'club.settings_update',
          entityType: 'club',
          entityId: clubId,
          requestId: audit.requestId,
          before: toClub(before) as unknown as Prisma.InputJsonValue,
          after: toClub(after) as unknown as Prisma.InputJsonValue,
        },
      });
      return toClub(after);
    });
  }

  private load(tx: Tx, id: string): Promise<ClubRow | null> {
    return tx.club.findUnique({ where: { id }, include: COURT_INCLUDE });
  }

  /** A court's rules are replaced as a whole; existing bookings keep what they were priced at. */
  private async replaceRules(
    tx: Tx,
    clubId: string,
    courtId: string,
    booking: CourtBookingSettings,
  ): Promise<void> {
    await tx.bookingSlotsRule.deleteMany({ where: { courtId, clubId } });
    const { deposit } = booking;
    for (const rule of booking.rules) {
      const ruleId = newId();
      await tx.bookingSlotsRule.create({
        data: {
          id: ruleId,
          clubId,
          courtId,
          daysOfWeek: rule.days.map((day) => WEEKDAYS.indexOf(day) + 1),
          opensAt: toDbTime(rule.opens_at),
          closesAt: toDbTime(rule.closes_at),
          allowedDurationsMinutes: rule.allowed_durations,
          startIntervalMinutes: rule.start_interval_minutes,
          depositKind: deposit.type,
          depositAmountCents: deposit.type === 'fixed' ? deposit.amount_cents : null,
          depositBps: deposit.type === 'percent' ? deposit.percent * 100 : null,
          cancellationHours: booking.cancellation_refund_hours,
          priceBands: {
            create: rule.price_bands.flatMap((band) =>
              band.prices.map((price) => ({
                id: newId(),
                clubId,
                startsAt: toDbTime(band.starts_at),
                endsAt: toDbTime(band.ends_at),
                durationMinutes: price.duration_minutes,
                priceCents: price.amount_cents,
              })),
            ),
          },
        },
      });
    }
  }
}
