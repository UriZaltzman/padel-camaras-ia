import type { ClubMeasures } from './usage.model';

/**
 * PLACEHOLDER infrastructure rates (docs/pendientes.md, `TODO_COTIZAR`): the real ones come from
 * the cloud and storage invoices. Amounts in ARS cents.
 */
export interface CostRates {
  centsPerStorageGb: number;
  centsPerVideoMinute: number;
  centsPerRecordedMatch: number;
  /** Fixed monthly cost per club (monitoring, support share, box connectivity). */
  fixedCents: number;
}

export const PLACEHOLDER_COST_RATES: CostRates = {
  centsPerStorageGb: 50_00,
  centsPerVideoMinute: 2_00,
  centsPerRecordedMatch: 100_00,
  fixedCents: 2_000_00,
};

/** Margin below this for two months in a row raises an alert (decision #253, SA-06). */
export const MARGIN_ALERT_BPS = 6_000;
export const MARGIN_ALERT_MONTHS = 2;
/** Within this share of the next band counts as near the limit. */
export const NEAR_LIMIT_RATIO = 0.1;

export const BYTES_PER_GB = 1024 ** 3;

export function storageGb(bytes: number): number {
  return Math.round((bytes / BYTES_PER_GB) * 100) / 100;
}

export function estimateCostCents(
  m: Pick<ClubMeasures, 'storageBytes' | 'videoMinutes' | 'recordedMatches'>,
  rates: CostRates,
): number {
  return Math.round(
    rates.fixedCents +
      (m.storageBytes / BYTES_PER_GB) * rates.centsPerStorageGb +
      m.videoMinutes * rates.centsPerVideoMinute +
      m.recordedMatches * rates.centsPerRecordedMatch,
  );
}

/** Basis points of margin over what was invoiced; null when nothing was invoiced. */
export function marginBps(invoicedCents: number, costCents: number): number | null {
  if (invoicedCents <= 0) return null;
  return Math.round(((invoicedCents - costCents) * 10_000) / invoicedCents);
}

/** Month `YYYY-MM` in Buenos Aires (UTC-3, no DST). */
export function periodOf(date: Date): string {
  const local = new Date(date.getTime() - 3 * 3_600_000);
  return local.toISOString().slice(0, 7);
}

export function previousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Start (inclusive) and end (exclusive) instants of a period in Buenos Aires time. */
export function periodBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return {
    start: new Date(Date.UTC(y, m - 1, 1, 3)),
    end: new Date(Date.UTC(y, m, 1, 3)),
  };
}
