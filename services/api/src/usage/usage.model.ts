/** Raw measures of one club in one month, read from the operational tables. */
export interface ClubMeasures {
  /** Distinct players with a booking, class or registration in the last 90 days. */
  activePlayers90d: number;
  /** Bookings (not cancelled) starting in the month. */
  bookings: number;
  recordedMatches: number;
  storageBytes: number;
  videoMinutes: number;
  /** Row count per club-scoped table, to see what grows. */
  rowCounts: Readonly<Record<string, number>>;
}

/** Reads the measures; the Prisma adapter runs as `system` scoped to the club (RLS). */
export interface UsageSourcePort {
  measure(clubId: string, periodStart: Date, periodEnd: Date, now: Date): Promise<ClubMeasures>;
}

/** One stored row per club and month (`period` is `YYYY-MM`, Buenos Aires time). */
export interface UsageSnapshot extends ClubMeasures {
  clubId: string;
  period: string;
  tierName: string;
  tierMinActivePlayers: number;
  tierMaxActivePlayers: number | null;
  nextTierAt: number | null;
  estimatedCostCents: number;
  invoicedCents: number;
  /** (invoiced - cost) / invoiced in basis points; null when nothing was invoiced. */
  marginBps: number | null;
  nearLimit: boolean;
  measuredAt: Date;
}

export interface UsageRepository {
  save(snapshot: UsageSnapshot): Promise<void>;
  get(clubId: string, period: string): Promise<UsageSnapshot | null>;
  /** All clubs for a period, ordered by club id. */
  byPeriod(period: string): Promise<UsageSnapshot[]>;
  /** Last `months` snapshots of a club up to and including `period`, oldest first. */
  history(clubId: string, period: string, months: number): Promise<UsageSnapshot[]>;
}

export class InMemoryUsageRepository implements UsageRepository {
  readonly rows = new Map<string, UsageSnapshot>();
  save(s: UsageSnapshot) {
    this.rows.set(`${s.clubId}|${s.period}`, { ...s });
    return Promise.resolve();
  }
  get(clubId: string, period: string) {
    return Promise.resolve(this.rows.get(`${clubId}|${period}`) ?? null);
  }
  byPeriod(period: string) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((s) => s.period === period)
        .sort((a, b) => a.clubId.localeCompare(b.clubId)),
    );
  }
  history(clubId: string, period: string, months: number) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((s) => s.clubId === clubId && s.period <= period)
        .sort((a, b) => a.period.localeCompare(b.period))
        .slice(-months),
    );
  }
}
