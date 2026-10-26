import { Injectable } from '@nestjs/common';
import type { AccessIdentity } from '../auth/session/session.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { AppError } from '../errors/app-error';
import { ClubBookingsRepository, type ClubBookingRow } from './club-bookings.repository';

const MAX_RANGE_MS = 31 * 24 * 3600 * 1000;

export interface ClubBookingsQuery {
  from: Date;
  to: Date;
  courtId?: string | undefined;
  status?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}

export interface ClubBookingDto {
  id: string;
  club_id: string;
  court_id: string;
  court_name: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  status: string;
  hold_expires_at: string | null;
  price_cents: number;
  deposit_cents: number;
  deposit_paid_cents: number;
  cancellation_refund_hours: number;
  source: 'app' | 'panel';
  players: {
    position: number;
    user: { id: string; name: string } | null;
    accepted: boolean;
    guardian_consent_on_file: boolean;
  }[];
  no_record: boolean;
  no_record_reason: null;
  series: null;
  created_at: string;
  booker: { user_id: string; name: string | null; phone: string | null; account_pending: boolean };
  match_id: null;
}

export interface ClubBookingPageDto {
  items: ClubBookingDto[];
  next_cursor: string | null;
}

/** Front desk view of the club's bookings (`GET /club-admin/bookings`), for staff and owner. */
@Injectable()
export class ClubBookingsService {
  constructor(
    private readonly repo: ClubBookingsRepository,
    private readonly access: ClubAccessService,
  ) {}

  async list(
    auth: AccessIdentity,
    clubId: string,
    q: ClubBookingsQuery,
  ): Promise<ClubBookingPageDto> {
    const { db } = await this.access.authorize(auth, clubId, 'club.operate');
    if (q.to.getTime() <= q.from.getTime() || q.to.getTime() - q.from.getTime() > MAX_RANGE_MS) {
      throw new AppError('VALIDATION_FAILED', { reason: 'range_too_long' });
    }
    const skip = decodeCursor(q.cursor);
    const rows = await this.repo.list(
      { ...db, clubId },
      {
        from: q.from,
        to: q.to,
        ...(q.courtId ? { courtId: q.courtId } : {}),
        ...(q.status ? { status: q.status } : {}),
        skip,
        take: q.limit + 1,
      },
    );
    const page = rows.slice(0, q.limit);
    return {
      items: page.map(toDto),
      next_cursor: rows.length > q.limit ? encodeCursor(skip + q.limit) : null,
    };
  }
}

function toDto(row: ClubBookingRow): ClubBookingDto {
  return {
    id: row.id,
    club_id: row.clubId,
    court_id: row.courtId,
    court_name: row.courtName,
    starts_at: row.startsAt.toISOString(),
    ends_at: row.endsAt.toISOString(),
    duration_minutes: Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60_000),
    status: row.status,
    hold_expires_at: row.holdExpiresAt?.toISOString() ?? null,
    price_cents: row.priceCents,
    deposit_cents: row.depositPaidCents,
    deposit_paid_cents: row.depositPaidCents,
    cancellation_refund_hours: 24,
    source: row.origin === 'app' ? 'app' : 'panel',
    players: [
      {
        position: 1,
        user: row.bookerId ? { id: row.bookerId, name: row.bookerName ?? '' } : null,
        accepted: true,
        guardian_consent_on_file: false,
      },
    ],
    no_record: row.noRecord,
    no_record_reason: null,
    series: null,
    created_at: row.createdAt.toISOString(),
    booker: {
      user_id: row.bookerId ?? '',
      name: row.bookerName,
      phone: row.bookerPhone,
      account_pending: false,
    },
    match_id: null,
  };
}

function encodeCursor(offset: number): string {
  return Buffer.from(`o:${offset}`).toString('base64url');
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const match = /^o:(\d{1,9})$/.exec(Buffer.from(cursor, 'base64url').toString());
  if (!match) throw new AppError('VALIDATION_FAILED', { reason: 'bad_cursor' });
  return Number(match[1]);
}
