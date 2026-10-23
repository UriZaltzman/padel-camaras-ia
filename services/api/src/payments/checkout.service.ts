import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CLOCK, type Clock } from '../common/clock';
import { parseInput } from '../common/zod';
import { newId } from '../db/ids';
import { AppError } from '../errors/app-error';
import { setLogContext } from '../logging/request-context';
import { CHECKOUT_STORE, type CheckoutStore } from './checkout-store';
import { feeBpsFor, marketplaceFeeCents } from './marketplace-fee';
import type { Checkout, CheckoutRequest } from './payments.model';
import { PaymentsRepository } from './payments.repository';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';

const uuid = z.uuid();
const checkoutSchema = z.discriminatedUnion('concept', [
  z.strictObject({ concept: z.literal('deposit'), booking_id: uuid }),
  z.strictObject({ concept: z.literal('player_extra'), match_id: uuid }),
  z.strictObject({ concept: z.literal('lesson'), lesson_id: uuid }),
]);
const idempotencyKeySchema = z.uuid();
const KEY_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class CheckoutService {
  constructor(
    private readonly repository: PaymentsRepository,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(CHECKOUT_STORE) private readonly store: CheckoutStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(userId: string, idempotencyKey: unknown, body: unknown): Promise<Checkout> {
    const key = parseInput(idempotencyKeySchema, idempotencyKey);
    const request: CheckoutRequest = parseInput(checkoutSchema, body);
    const storeKey = `${userId}:${key}`;

    const previous = await this.store.get(storeKey);
    if (previous) return previous;

    const target = await this.repository.resolveTarget(userId, request, this.clock.now());
    setLogContext({ club_id: target.clubId });
    const feeCents = marketplaceFeeCents(target.amountCents, feeBpsFor(target.concept));
    const paymentId = newId();

    // The provider is called first: if it fails nothing is stored and the client can retry.
    const preference = await this.provider.createPreference({
      externalReference: `${target.clubId}:${paymentId}`,
      title: target.title,
      amountCents: target.amountCents,
      marketplaceFeeCents: feeCents,
      collectorId: target.collectorId,
      expiresAt: target.expiresAt,
    });
    await this.repository.create({
      id: paymentId,
      clubId: target.clubId,
      userId,
      concept: target.concept,
      bookingId: target.bookingId,
      matchId: target.matchId,
      lessonId: target.lessonId,
      amountCents: target.amountCents,
      feeCents,
    });

    const checkout: Checkout = {
      payment_id: paymentId,
      concept: target.concept,
      status: 'pending',
      amount_cents: target.amountCents,
      marketplace_fee_cents: feeCents,
      payee: target.payee,
      checkout_url: preference.checkoutUrl,
      expires_at: target.expiresAt ? target.expiresAt.toISOString() : null,
    };
    if (!(await this.store.setIfAbsent(storeKey, checkout, KEY_TTL_SECONDS))) {
      // A concurrent request with the same key won; return its checkout.
      const winner = await this.store.get(storeKey);
      if (winner) return winner;
      throw new AppError('INTERNAL_ERROR');
    }
    return checkout;
  }
}
