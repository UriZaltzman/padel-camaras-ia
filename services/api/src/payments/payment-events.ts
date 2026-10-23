export const PAYMENT_EVENTS = Symbol('PAYMENT_EVENTS');

export interface PaymentEvent {
  type: 'payment.approved' | 'payment.refunded';
  paymentId: string;
  userId: string | null;
  clubId: string;
  bookingId: string | null;
  amountCents: number;
  providerPaymentId: string;
}

/** Where payment events go. The EventBus adapter is bound when the events module is wired in. */
export interface PaymentEventPublisher {
  publish(event: PaymentEvent): Promise<void>;
}

export class RecordingPaymentEvents implements PaymentEventPublisher {
  readonly events: PaymentEvent[] = [];
  publish(event: PaymentEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}
