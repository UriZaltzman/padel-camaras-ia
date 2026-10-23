import type { FeeConcept } from './marketplace-fee';

export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'refunded';
export type Payee = 'club' | 'coach' | 'platform';

export type CheckoutRequest =
  | { concept: 'deposit'; booking_id: string }
  | { concept: 'player_extra'; match_id: string }
  | { concept: 'lesson'; lesson_id: string };

/** What a checkout will charge, resolved on the server (the client never sends an amount). */
export interface CheckoutTarget {
  concept: FeeConcept;
  clubId: string;
  amountCents: number;
  collectorId: string | null;
  payee: Payee;
  title: string;
  bookingId: string | null;
  matchId: string | null;
  lessonId: string | null;
  /** End of the booking hold, for deposits. */
  expiresAt: Date | null;
}

export interface PaymentRecord {
  id: string;
  clubId: string;
  userId: string | null;
  concept: FeeConcept | 'subscription';
  bookingId: string | null;
  amountCents: number;
  feeCents: number;
  status: PaymentStatus;
  providerPaymentId: string | null;
}

export interface NewPayment {
  id: string;
  clubId: string;
  userId: string;
  concept: FeeConcept;
  bookingId: string | null;
  matchId: string | null;
  lessonId: string | null;
  amountCents: number;
  feeCents: number;
}

export type ConfirmDepositResult = 'confirmed' | 'hold_expired' | 'not_held';

export interface Checkout {
  payment_id: string;
  concept: FeeConcept;
  status: PaymentStatus;
  amount_cents: number;
  marketplace_fee_cents: number;
  payee: Payee;
  checkout_url: string;
  expires_at: string | null;
}
