export interface FavoriteClubRecord {
  clubId: string;
  name: string;
  address: string | null;
  logoUrl: string | null;
  timezone: string;
  position: number;
}

export interface FavoriteBookingRecord {
  id: string;
  clubId: string;
  courtId: string;
  courtName: string;
  startsAt: Date;
  endsAt: Date;
  status: 'held' | 'confirmed';
}

export abstract class FavoritesRepository {
  /** The player's favorites in their order. */
  abstract list(userId: string): Promise<FavoriteClubRecord[]>;
  /** False when the club does not exist. Adding twice keeps the first position. */
  abstract add(
    userId: string,
    clubId: string,
    max: number,
  ): Promise<'added' | 'exists' | 'no_club' | 'full'>;
  /** Removes the row and closes the gap in the order; false when it was not a favorite. */
  abstract remove(userId: string, clubId: string): Promise<boolean>;
  /** Rewrites the order; false when `clubIds` is not exactly the player's favorites. */
  abstract reorder(userId: string, clubIds: string[]): Promise<boolean>;
  /** Active courts of the club (readable by any player). */
  abstract activeCourts(clubId: string): Promise<{ id: string; name: string }[]>;
  /** The player's upcoming bookings in each club, soonest first, at most `perClub` each. */
  abstract upcomingBookings(
    userId: string,
    clubIds: string[],
    now: Date,
    perClub: number,
  ): Promise<FavoriteBookingRecord[]>;
  /** Anonymous count of players that starred the club; staff and owner of the club only. */
  abstract countFor(ctx: {
    role: 'staff' | 'owner';
    userId: string;
    clubId: string;
  }): Promise<number>;
}

/** Contract tests run without a database. */
export class InMemoryFavoritesRepository extends FavoritesRepository {
  list(): Promise<FavoriteClubRecord[]> {
    return Promise.resolve([]);
  }
  add(): Promise<'no_club'> {
    return Promise.resolve('no_club');
  }
  remove(): Promise<boolean> {
    return Promise.resolve(false);
  }
  reorder(): Promise<boolean> {
    return Promise.resolve(false);
  }
  activeCourts(): Promise<never[]> {
    return Promise.resolve([]);
  }
  upcomingBookings(): Promise<FavoriteBookingRecord[]> {
    return Promise.resolve([]);
  }
  countFor(): Promise<number> {
    return Promise.resolve(0);
  }
}
