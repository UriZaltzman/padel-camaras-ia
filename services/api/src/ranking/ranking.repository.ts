export interface RankingRow {
  userId: string;
  name: string;
  photoUrl: string | null;
  rating: number;
  matchesRated: number;
  /** Rated matches played in this club inside the window. */
  matches: number;
  wins: number;
}

export abstract class RankingRepository {
  /** Whether the user holds an active role in the club or played a confirmed match there. */
  abstract isParticipant(userId: string, clubId: string): Promise<boolean>;
  /**
   * Players with at least one finished match in the club since `since`, with their global
   * rating. Reads with the club's database context, so no other club's rows can appear.
   */
  abstract rows(clubId: string, since: Date): Promise<RankingRow[]>;
}
