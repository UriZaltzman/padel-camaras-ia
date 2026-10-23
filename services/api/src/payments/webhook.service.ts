import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { CLOCK, type Clock } from '../common/clock';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env';
import { AppError } from '../errors/app-error';
import { createLogger } from '../logging/logger';
import { setLogContext } from '../logging/request-context';
import { verifyMercadoPagoSignature } from './mercadopago-signature';
import { PAYMENT_EVENTS, type PaymentEventPublisher } from './payment-events';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';
import { PaymentsRepository } from './payments.repository';

export interface WebhookInput {
  signatureHeader: string | undefined;
  requestId: string | undefined;
  /** `data.id` from the query string. */
  dataId: string | undefined;
  /** `type` from the query string or the body. */
  type: string | undefined;
}

const REFERENCE = /^([0-9a-f-]{36}):([0-9a-f-]{36})$/i;

/**
 * Applies Mercado Pago notifications (section 10). Only this path changes `payments.status`;
 * the redirect after checkout never does. Safe to run any number of times for the same payment.
 */
@Injectable()
export class WebhookService {
  private readonly logger: Logger;

  constructor(
    private readonly repository: PaymentsRepository,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(PAYMENT_EVENTS) private readonly events: PaymentEventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.logger = createLogger(env).child({ context: 'MercadoPagoWebhook' });
  }

  async handle(input: WebhookInput): Promise<void> {
    const secret = this.env.MERCADOPAGO_WEBHOOK_SECRET;
    // Without a secret nothing can be verified, so nothing is accepted.
    if (
      !secret ||
      !verifyMercadoPagoSignature({
        signatureHeader: input.signatureHeader,
        requestId: input.requestId,
        dataId: input.dataId,
        secret,
        now: this.clock.now(),
      })
    ) {
      this.logger.warn({ request_id: input.requestId }, 'webhook signature rejected');
      throw new AppError('WEBHOOK_SIGNATURE_INVALID');
    }
    // Other notification types are acknowledged so Mercado Pago stops retrying them.
    if (input.type !== undefined && input.type !== 'payment') return;
    if (!input.dataId) return;
    await this.applyPayment(input.dataId);
  }

  private async applyPayment(providerPaymentId: string): Promise<void> {
    // The body is never trusted: status and amount are read back from the provider.
    const remote = await this.provider.getPayment(providerPaymentId);
    const match = remote.externalReference ? REFERENCE.exec(remote.externalReference) : null;
    if (!match) {
      this.logger.warn({ provider_payment_id: providerPaymentId }, 'payment without our reference');
      return;
    }
    const [, clubId, paymentId] = match as unknown as [string, string, string];
    setLogContext({ club_id: clubId });
    const payment = await this.repository.find(clubId, paymentId);
    if (!payment) {
      this.logger.warn({ provider_payment_id: providerPaymentId }, 'payment not found');
      return;
    }
    if (remote.amountCents !== payment.amountCents) {
      this.logger.error({ payment_id: paymentId }, 'amount mismatch, payment ignored');
      return;
    }

    if (remote.status === 'rejected') {
      await this.repository.transition(clubId, paymentId, 'pending', 'rejected', providerPaymentId);
      return;
    }
    if (remote.status === 'refunded') {
      if (
        await this.repository.transition(
          clubId,
          paymentId,
          'approved',
          'refunded',
          providerPaymentId,
        )
      ) {
        await this.emit('payment.refunded', payment, providerPaymentId);
      }
      return;
    }
    if (remote.status !== 'approved') return;

    // Only the delivery that wins this conditional update continues; repeats stop here.
    if (
      !(await this.repository.transition(
        clubId,
        paymentId,
        'pending',
        'approved',
        providerPaymentId,
      ))
    ) {
      return;
    }
    if (payment.concept === 'deposit' && payment.bookingId) {
      const result = await this.repository.confirmDeposit(
        clubId,
        payment.bookingId,
        payment.amountCents,
        this.clock.now(),
      );
      if (result !== 'confirmed') {
        // Approved after the hold ended: the slot may belong to someone else, so give it back.
        this.logger.warn(
          { payment_id: paymentId, booking_result: result },
          'late approval, refunding',
        );
        await this.provider.refund(providerPaymentId);
        await this.repository.transition(
          clubId,
          paymentId,
          'approved',
          'refunded',
          providerPaymentId,
        );
        await this.emit('payment.refunded', payment, providerPaymentId);
        return;
      }
    }
    await this.emit('payment.approved', payment, providerPaymentId);
  }

  private emit(
    type: 'payment.approved' | 'payment.refunded',
    payment: {
      id: string;
      clubId: string;
      userId: string | null;
      bookingId: string | null;
      amountCents: number;
    },
    providerPaymentId: string,
  ): Promise<void> {
    return this.events.publish({
      type,
      paymentId: payment.id,
      userId: payment.userId,
      clubId: payment.clubId,
      bookingId: payment.bookingId,
      amountCents: payment.amountCents,
      providerPaymentId,
    });
  }
}
