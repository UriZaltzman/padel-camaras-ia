import type {
  CheckoutRequest,
  CheckoutTarget,
  ConfirmDepositResult,
  NewPayment,
  PaymentRecord,
  PaymentStatus,
} from './payments.model';
import { PaymentsRepository } from './payments.repository';

export interface FakeBooking {
  clubId: string;
  status: 'held' | 'confirmed' | 'expired' | 'cancelled';
  holdExpiresAt: Date | null;
  depositPaidCents: number;
}

/** Test double: targets are registered by the test, rows live in memory. */
export class InMemoryPaymentsRepository extends PaymentsRepository {
  readonly payments = new Map<string, PaymentRecord>();
  readonly bookings = new Map<string, FakeBooking>();
  readonly targets = new Map<string, CheckoutTarget>();

  private key(request: CheckoutRequest): string {
    if (request.concept === 'deposit') return request.booking_id;
    return request.concept === 'player_extra' ? request.match_id : request.lesson_id;
  }

  resolveTarget(_userId: string, request: CheckoutRequest): Promise<CheckoutTarget> {
    const target = this.targets.get(this.key(request));
    if (!target) return Promise.reject(new Error('target not registered'));
    return Promise.resolve(target);
  }

  create(payment: NewPayment): Promise<void> {
    this.payments.set(payment.id, {
      id: payment.id,
      clubId: payment.clubId,
      userId: payment.userId,
      concept: payment.concept,
      bookingId: payment.bookingId,
      amountCents: payment.amountCents,
      feeCents: payment.feeCents,
      status: 'pending',
      providerPaymentId: null,
    });
    return Promise.resolve();
  }

  find(clubId: string, paymentId: string): Promise<PaymentRecord | null> {
    const found = this.payments.get(paymentId);
    return Promise.resolve(found && found.clubId === clubId ? { ...found } : null);
  }

  transition(
    clubId: string,
    paymentId: string,
    from: PaymentStatus,
    to: PaymentStatus,
    providerPaymentId: string,
  ): Promise<boolean> {
    const found = this.payments.get(paymentId);
    if (!found || found.clubId !== clubId || found.status !== from) return Promise.resolve(false);
    found.status = to;
    found.providerPaymentId = providerPaymentId;
    return Promise.resolve(true);
  }

  confirmDeposit(
    clubId: string,
    bookingId: string,
    amountCents: number,
    now: Date,
  ): Promise<ConfirmDepositResult> {
    const booking = this.bookings.get(bookingId);
    if (!booking || booking.clubId !== clubId) return Promise.resolve('not_held');
    if (booking.status !== 'held') return Promise.resolve('not_held');
    if (!booking.holdExpiresAt || booking.holdExpiresAt <= now)
      return Promise.resolve('hold_expired');
    booking.status = 'confirmed';
    booking.depositPaidCents += amountCents;
    return Promise.resolve('confirmed');
  }
}
