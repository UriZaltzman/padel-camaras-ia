import type { DbRole } from '../db/db-context';

export interface CancelTarget {
  id: string;
  clubId: string;
  startsAt: Date;
  status: 'held' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'expired';
  cancelledAt: Date | null;
  depositPaidCents: number;
  createdByUserId: string | null;
  /** User in position 1 of the booking. */
  firstPlayerId: string | null;
  courtRefundHours: number | null;
  clubRefundHours: number | null;
  /** Approved deposit payment, if the deposit was paid through Mercado Pago. */
  deposit: { paymentId: string; providerPaymentId: string; status: 'approved' | 'refunded' } | null;
}

export interface StaffClub {
  clubId: string;
  role: Extract<DbRole, 'staff' | 'owner'>;
}

export abstract class CancellationRepository {
  /** Clubs where the user is active staff or owner. */
  abstract staffClubs(userId: string): Promise<StaffClub[]>;
  /** The booking as seen by the caller (row level security decides). */
  abstract find(
    actor: { role: DbRole; userId: string; clubId?: string },
    bookingId: string,
  ): Promise<CancelTarget | null>;
  /** `confirmed` -> `cancelled` in one conditional update; false if it already moved. */
  abstract markCancelled(clubId: string, bookingId: string, now: Date): Promise<boolean>;
  /** `confirmed` -> `no_show`; false if it already moved. */
  abstract markNoShow(clubId: string, bookingId: string): Promise<boolean>;
  /** Cancelled bookings of the club whose deposit payment is still `approved`. */
  abstract cancelledWithOpenDeposit(clubId: string): Promise<CancelTarget[]>;
}
