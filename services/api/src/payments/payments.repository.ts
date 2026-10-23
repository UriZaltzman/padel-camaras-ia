import type {
  CheckoutRequest,
  CheckoutTarget,
  ConfirmDepositResult,
  NewPayment,
  PaymentRecord,
  PaymentStatus,
} from './payments.model';

/** Persistence port of the payments module. The Prisma adapter is the production binding. */
export abstract class PaymentsRepository {
  /** Throws `NOT_FOUND` / `CLUB_FEATURE_DISABLED` / `BOOKING_HOLD_EXPIRED` / `INVALID_STATE_TRANSITION`. */
  abstract resolveTarget(
    userId: string,
    request: CheckoutRequest,
    now: Date,
  ): Promise<CheckoutTarget>;
  abstract create(payment: NewPayment): Promise<void>;
  abstract find(clubId: string, paymentId: string): Promise<PaymentRecord | null>;
  /**
   * Moves a payment only if it is still in `from` (one atomic conditional update). Returns false
   * when another delivery already moved it. Records the provider payment id on the way.
   */
  abstract transition(
    clubId: string,
    paymentId: string,
    from: PaymentStatus,
    to: PaymentStatus,
    providerPaymentId: string,
  ): Promise<boolean>;
  /** `held` and not expired -> `confirmed`, counting the deposit as paid. */
  abstract confirmDeposit(
    clubId: string,
    bookingId: string,
    amountCents: number,
    now: Date,
  ): Promise<ConfirmDepositResult>;
}
