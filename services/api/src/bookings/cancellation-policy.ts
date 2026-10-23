/** Refund window fallback when neither the court nor the club sets one (spec §9). */
export const DEFAULT_REFUND_HOURS = 24;

/**
 * Hours of notice that keep the deposit refundable. Open decision #242: the window may live per
 * court or per club, so both are read and the court wins; nothing here chooses between them.
 */
export function resolveRefundHours(
  courtHours: number | null | undefined,
  clubHours: number | null | undefined,
): number {
  return courtHours ?? clubHours ?? DEFAULT_REFUND_HOURS;
}

/** True when the cancellation happens at least `hours` before the start. */
export function refundableInTime(startsAt: Date, cancelledAt: Date, hours: number): boolean {
  return startsAt.getTime() - cancelledAt.getTime() >= hours * 3_600_000;
}
