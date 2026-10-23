import type { DbContext } from '../db/db-context';

export type BlockKind = 'maintenance' | 'holiday' | 'closure';

export interface BlockCourt {
  id: string;
  status: 'active' | 'maintenance' | 'inactive';
  timezone: string;
}

/** A booking or block that overlaps a requested block. */
export interface ConflictingBooking {
  id: string;
  courtId: string;
  startsAt: Date;
  endsAt: Date;
  status: 'held' | 'confirmed' | 'completed' | 'no_show';
  isBlock: boolean;
  /** Player to notify when the booking is cancelled. */
  playerUserId: string | null;
}

export interface NewBlock {
  id: string;
  clubId: string;
  courtId: string;
  startsAt: Date;
  endsAt: Date;
  kind: BlockKind;
  reason: string | null;
  seriesId: string | null;
  createdByUserId: string;
}

export interface StoredBlock {
  id: string;
  clubId: string;
  courtId: string;
  startsAt: Date;
  endsAt: Date;
  kind: BlockKind;
  reason: string | null;
  seriesId: string | null;
}

export abstract class CourtBlocksRepository {
  /** The club's courts among `courtIds` (any status), with the club timezone. */
  abstract courts(ctx: DbContext, clubId: string, courtIds: string[]): Promise<BlockCourt[]>;
  /** Flips expired holds to `expired` so they stop counting as conflicts. */
  abstract expireHolds(ctx: DbContext, clubId: string, now: Date): Promise<void>;
  abstract conflicts(
    ctx: DbContext,
    courtId: string,
    from: Date,
    to: Date,
  ): Promise<ConflictingBooking[]>;
  /** Active courts of the club, other than `exceptCourtId`, free during `[from, to)`. */
  abstract freeCourts(
    ctx: DbContext,
    clubId: string,
    exceptCourtIds: string[],
    from: Date,
    to: Date,
  ): Promise<string[]>;
  /** Moves a booking to another court; throws `SlotTakenError` if that court is busy. */
  abstract moveBooking(ctx: DbContext, bookingId: string, courtId: string): Promise<void>;
  /** Cancels a `held` booking (no money moved yet). */
  abstract cancelHold(ctx: DbContext, bookingId: string, now: Date): Promise<void>;
  /** Inserts the block; throws `SlotTakenError` on the exclusion constraint. */
  abstract insert(ctx: DbContext, block: NewBlock): Promise<StoredBlock>;
  abstract list(ctx: DbContext, clubId: string, from: Date, to: Date): Promise<StoredBlock[]>;
  abstract remove(ctx: DbContext, clubId: string, blockId: string): Promise<boolean>;
}

/** Tells a player that the club cancelled their booking. */
export abstract class BlockNotifier {
  abstract bookingCancelledByClub(input: {
    bookingId: string;
    clubId: string;
    userId: string;
    startsAt: Date;
    refundCents: number;
    reason: string | null;
  }): Promise<void>;
}
