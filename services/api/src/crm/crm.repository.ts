import type { DbContext } from '../db/db-context';
import type { CrmBooking } from './crm-metrics';

export interface CrmPerson {
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  tags: string[];
  notes: string | null;
  /** Approved payments at the club; `null` when the caller may not see money (staff). */
  spendCents: number | null;
  bookings: (CrmBooking & { courtName: string; priceCents: number })[];
}

/** Reads the club's people for the CRM. `PrismaCrmRepository` is the real one (RLS decides). */
export abstract class CrmRepository {
  /** Everyone with a booking at the club (the booker, or an invited player who accepted). */
  abstract people(ctx: DbContext & { clubId: string }, userId?: string): Promise<CrmPerson[]>;
  /** Replaces tags and note; false when the person has no booking at the club. */
  abstract saveNotes(
    ctx: DbContext & { clubId: string },
    userId: string,
    tags: string[],
    notes: string | null,
  ): Promise<boolean>;
}
