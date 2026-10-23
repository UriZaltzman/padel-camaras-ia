import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/common/clock';
import { AppError } from '../../src/errors/app-error';
import { InMemoryCheckoutStore } from '../../src/payments/checkout-store';
import { CheckoutService } from '../../src/payments/checkout.service';
import { InMemoryPaymentsRepository } from '../../src/payments/in-memory-payments.repository';
import { feeBpsFor, marketplaceFeeCents } from '../../src/payments/marketplace-fee';
import { FakePaymentProvider } from '../../src/payments/payment-provider';
import type { CheckoutTarget } from '../../src/payments/payments.model';

const CLUB = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e01';
const USER = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e02';
const BOOKING = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e03';
const MATCH = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e04';
const KEY = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e05';

describe('marketplaceFeeCents', () => {
  it('takes 10 % of the amount in whole cents', () => {
    expect(marketplaceFeeCents(1_200_000, 1_000)).toBe(120_000);
    expect(marketplaceFeeCents(0, 1_000)).toBe(0);
  });

  it('rounds half up and never goes above the amount', () => {
    expect(marketplaceFeeCents(5, 1_000)).toBe(1); // 0.5 -> 1
    expect(marketplaceFeeCents(4, 1_000)).toBe(0); // 0.4 -> 0
    expect(marketplaceFeeCents(1_999, 1_000)).toBe(200); // 199.9 -> 200
    expect(marketplaceFeeCents(777, 10_000)).toBe(777);
  });

  it('is exact for large amounts (integers, no float drift)', () => {
    expect(marketplaceFeeCents(99_999_999, 1_000)).toBe(10_000_000);
  });

  it('rejects non-integer or negative input', () => {
    expect(() => marketplaceFeeCents(10.5, 1_000)).toThrow(RangeError);
    expect(() => marketplaceFeeCents(-1, 1_000)).toThrow(RangeError);
    expect(() => marketplaceFeeCents(100, 10_001)).toThrow(RangeError);
  });

  it('charges no fee on deposits during the pilot and 10 % on extras and lessons', () => {
    expect(feeBpsFor('deposit')).toBe(0);
    expect(feeBpsFor('player_extra')).toBe(1_000);
    expect(feeBpsFor('lesson')).toBe(1_000);
  });
});

function setup() {
  const repository = new InMemoryPaymentsRepository();
  const provider = new FakePaymentProvider();
  const clock = new FakeClock();
  const service = new CheckoutService(repository, provider, new InMemoryCheckoutStore(), clock);
  const target = (overrides: Partial<CheckoutTarget>): CheckoutTarget => ({
    concept: 'player_extra',
    clubId: CLUB,
    amountCents: 500_000,
    collectorId: 'mp-club-1',
    payee: 'club',
    title: 'Extras del partido',
    bookingId: null,
    matchId: MATCH,
    lessonId: null,
    expiresAt: null,
    ...overrides,
  });
  return { repository, provider, service, target };
}

describe('CheckoutService', () => {
  it('opens a pending extra payment with the 10 % marketplace fee', async () => {
    const { repository, provider, service, target } = setup();
    repository.targets.set(MATCH, target({}));

    const checkout = await service.create(USER, KEY, { concept: 'player_extra', match_id: MATCH });

    expect(checkout).toMatchObject({
      concept: 'player_extra',
      status: 'pending',
      amount_cents: 500_000,
      marketplace_fee_cents: 50_000,
      payee: 'club',
    });
    expect(checkout.checkout_url).toContain('https://');
    expect(provider.preferences[0]).toMatchObject({
      marketplaceFeeCents: 50_000,
      collectorId: 'mp-club-1',
      externalReference: `${CLUB}:${checkout.payment_id}`,
    });
    expect(repository.payments.get(checkout.payment_id)).toMatchObject({
      status: 'pending',
      feeCents: 50_000,
      providerPaymentId: null,
    });
  });

  it('charges deposits without commission and reports the hold end', async () => {
    const { repository, service, target } = setup();
    const expiresAt = new Date('2026-11-01T12:10:00.000Z');
    repository.targets.set(
      BOOKING,
      target({
        concept: 'deposit',
        bookingId: BOOKING,
        matchId: null,
        amountCents: 1_200_000,
        expiresAt,
      }),
    );

    const checkout = await service.create(USER, KEY, { concept: 'deposit', booking_id: BOOKING });

    expect(checkout.marketplace_fee_cents).toBe(0);
    expect(checkout.expires_at).toBe('2026-11-01T12:10:00.000Z');
  });

  it('returns the same checkout for a retry with the same Idempotency-Key', async () => {
    const { repository, provider, service, target } = setup();
    repository.targets.set(MATCH, target({}));
    const body = { concept: 'player_extra', match_id: MATCH };

    const first = await service.create(USER, KEY, body);
    const second = await service.create(USER, KEY, body);

    expect(second).toEqual(first);
    expect(repository.payments.size).toBe(1);
    expect(provider.preferences).toHaveLength(1);
  });

  it('does not share keys between users', async () => {
    const { repository, service, target } = setup();
    repository.targets.set(MATCH, target({}));
    const body = { concept: 'player_extra', match_id: MATCH };
    const a = await service.create(USER, KEY, body);
    const b = await service.create('0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e99', KEY, body);
    expect(b.payment_id).not.toBe(a.payment_id);
  });

  it('rejects a missing key and a body that carries an amount', async () => {
    const { service } = setup();
    await expect(service.create(USER, undefined, {})).rejects.toThrow();
    await expect(
      service.create(USER, KEY, { concept: 'player_extra', match_id: MATCH, amount_cents: 1 }),
    ).rejects.toThrow();
  });

  it('stores nothing when the provider fails', async () => {
    const { repository, provider, service, target } = setup();
    repository.targets.set(MATCH, target({}));
    provider.createPreference = () => Promise.reject(new AppError('PAYMENT_PROVIDER_ERROR'));
    await expect(
      service.create(USER, KEY, { concept: 'player_extra', match_id: MATCH }),
    ).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_ERROR' });
    expect(repository.payments.size).toBe(0);
  });
});
