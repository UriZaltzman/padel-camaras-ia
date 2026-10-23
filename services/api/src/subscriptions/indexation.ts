/** Months between index adjustments (section 10). */
export const INDEX_PERIOD_MONTHS = 3;

/** Whole calendar months from `start` to `at` (both `Date`, compared in UTC). */
export function monthsBetween(start: Date, at: Date): number {
  let months =
    (at.getUTCFullYear() - start.getUTCFullYear()) * 12 + (at.getUTCMonth() - start.getUTCMonth());
  if (at.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** How many quarterly adjustments have come due `at` since the contract started. */
export function adjustmentsDue(contractStart: Date, at: Date): number {
  return Math.floor(monthsBetween(contractStart, at) / INDEX_PERIOD_MONTHS);
}

/** One adjustment: `cents` raised by `indexBps` (basis points, e.g. 800 = 8 %), rounded half up. */
export function applyIndex(cents: number, indexBps: number): number {
  return Math.floor((cents * (10_000 + indexBps) + 5_000) / 10_000);
}

/**
 * Price after every adjustment already due. `indexByQuarter[i]` is the index of the quarter
 * `i + 1` (from the contract). A quarter that is due but has no published index adds nothing,
 * so a club is never charged an invented number.
 */
export function indexedPrice(
  listCents: number,
  contractStart: Date,
  at: Date,
  indexByQuarter: readonly number[],
): number {
  const due = adjustmentsDue(contractStart, at);
  let price = listCents;
  for (let i = 0; i < due; i += 1) price = applyIndex(price, indexByQuarter[i] ?? 0);
  return price;
}
