/** Our commission on player extras and lessons (section 10): 10 % of the payment. */
export const MARKETPLACE_FEE_BPS = 1_000;

export type FeeConcept = 'deposit' | 'player_extra' | 'lesson';

/** Basis points charged per concept. Deposits carry no fee during the pilot. */
export function feeBpsFor(concept: FeeConcept): number {
  return concept === 'deposit' ? 0 : MARKETPLACE_FEE_BPS;
}

/**
 * Commission in ARS cents for `amountCents`, rounded half up. Integer math only: money is never
 * a float. The result is always between 0 and the amount (the `payments.fee_cents` CHECK).
 */
export function marketplaceFeeCents(amountCents: number, bps: number): number {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new RangeError('amountCents must be a non-negative integer');
  }
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new RangeError('bps must be an integer between 0 and 10000');
  }
  return Math.floor((amountCents * bps + 5_000) / 10_000);
}
