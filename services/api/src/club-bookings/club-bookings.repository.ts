import type { DbContext } from '../db/db-context';

export interface ClubBookingRow {
  id: string;
  clubId: string;
  courtId: string;
  courtName: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  holdExpiresAt: Date | null;
  priceCents: number;
  depositPaidCents: number;
  origin: string;
  noRecord: boolean;
  createdAt: Date;
  bookerId: string | null;
  bookerName: string | null;
  bookerPhone: string | null;
}

export interface ClubBookingFilter {
  from: Date;
  to: Date;
  courtId?: string;
  status?: string;
  skip: number;
  take: number;
}

/** Bookings of a club in a range (court blocks and tournament turns are not bookings of a player). */
export abstract class ClubBookingsRepository {
  abstract list(
    ctx: DbContext & { clubId: string },
    filter: ClubBookingFilter,
  ): Promise<ClubBookingRow[]>;
}
