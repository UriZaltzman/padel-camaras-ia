import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/common/clock';
import { loadEnv } from '../../src/config/env';
import {
  buildManifest,
  signManifest,
  verifyMercadoPagoSignature,
} from '../../src/payments/mercadopago-signature';
import { InMemoryPaymentsRepository } from '../../src/payments/in-memory-payments.repository';
import { RecordingPaymentEvents } from '../../src/payments/payment-events';
import { FakePaymentProvider } from '../../src/payments/payment-provider';
import { WebhookService } from '../../src/payments/webhook.service';
import { createTestApp, VALID_ENV } from '../helpers';

const SECRET = 'webhook-secret-for-tests-only';
const CLUB = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e01';
const USER = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e02';
const BOOKING = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e03';
const PAYMENT = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e06';
const MP_ID = '1234567890';

function signedHeaders(clock: FakeClock, dataId = MP_ID, requestId = 'req-1', secret = SECRET) {
  const ts = String(Math.floor(clock.now().getTime() / 1000));
  const v1 = signManifest(buildManifest(dataId, requestId, ts), secret);
  return { signatureHeader: `ts=${ts},v1=${v1}`, requestId, dataId, type: 'payment' };
}

describe('verifyMercadoPagoSignature', () => {
  const now = new Date('2026-11-01T12:00:00.000Z');
  const ts = String(now.getTime() / 1000);
  const good = signManifest(buildManifest(MP_ID, 'r1', ts), SECRET);
  const base = { requestId: 'r1', dataId: MP_ID, secret: SECRET, now };

  it('accepts a valid signature', () => {
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: `ts=${ts},v1=${good}` })).toBe(
      true,
    );
  });
  it('lower-cases an alphanumeric data.id in the manifest', () => {
    expect(buildManifest('ABC123', 'r', '1')).toBe('id:abc123;request-id:r;ts:1;');
  });
  it('rejects a wrong secret, a tampered id and malformed headers', () => {
    expect(
      verifyMercadoPagoSignature({
        ...base,
        secret: 'other-secret-xxxxxxxx',
        signatureHeader: `ts=${ts},v1=${good}`,
      }),
    ).toBe(false);
    expect(
      verifyMercadoPagoSignature({
        ...base,
        dataId: '999',
        signatureHeader: `ts=${ts},v1=${good}`,
      }),
    ).toBe(false);
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: undefined })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: 'garbage' })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: `ts=${ts},v1=zz` })).toBe(false);
  });
  it('rejects a replay older than 5 minutes', () => {
    const late = new Date(now.getTime() + 6 * 60 * 1000);
    expect(
      verifyMercadoPagoSignature({ ...base, now: late, signatureHeader: `ts=${ts},v1=${good}` }),
    ).toBe(false);
  });
});

function setup() {
  const repository = new InMemoryPaymentsRepository();
  const provider = new FakePaymentProvider();
  const events = new RecordingPaymentEvents();
  const clock = new FakeClock();
  const env = loadEnv({ ...VALID_ENV, MERCADOPAGO_WEBHOOK_SECRET: SECRET });
  const service = new WebhookService(repository, provider, events, clock, env);
  repository.payments.set(PAYMENT, {
    id: PAYMENT,
    clubId: CLUB,
    userId: USER,
    concept: 'deposit',
    bookingId: BOOKING,
    amountCents: 1_200_000,
    feeCents: 0,
    status: 'pending',
    providerPaymentId: null,
  });
  repository.bookings.set(BOOKING, {
    clubId: CLUB,
    status: 'held',
    holdExpiresAt: new Date(clock.now().getTime() + 10 * 60 * 1000),
    depositPaidCents: 0,
  });
  const approve = (status: 'approved' | 'rejected' | 'refunded' = 'approved') =>
    provider.setStatus(MP_ID, `${CLUB}:${PAYMENT}`, 1_200_000, status);
  return { repository, provider, events, clock, service, approve };
}

describe('WebhookService', () => {
  it('rejects an invalid signature and changes nothing', async () => {
    const { repository, service, approve, clock } = setup();
    approve();
    const input = { ...signedHeaders(clock, MP_ID, 'req-1', 'wrong-secret-xxxxxxxx') };
    await expect(service.handle(input)).rejects.toMatchObject({
      code: 'WEBHOOK_SIGNATURE_INVALID',
    });
    expect(repository.payments.get(PAYMENT)?.status).toBe('pending');
  });

  it('approves the payment and confirms the held booking', async () => {
    const { repository, events, service, approve, clock } = setup();
    approve();
    await service.handle(signedHeaders(clock));
    expect(repository.payments.get(PAYMENT)).toMatchObject({
      status: 'approved',
      providerPaymentId: MP_ID,
    });
    expect(repository.bookings.get(BOOKING)).toMatchObject({
      status: 'confirmed',
      depositPaidCents: 1_200_000,
    });
    expect(events.events.map((e) => e.type)).toEqual(['payment.approved']);
  });

  it('processes a repeated webhook once', async () => {
    const { repository, events, service, approve, clock } = setup();
    approve();
    const input = signedHeaders(clock);
    await service.handle(input);
    await service.handle(input);
    await Promise.all([service.handle(input), service.handle(input)]);
    expect(events.events).toHaveLength(1);
    expect(repository.bookings.get(BOOKING)?.depositPaidCents).toBe(1_200_000);
  });

  it('refunds automatically when the approval arrives after the hold expired', async () => {
    const { repository, provider, events, service, approve, clock } = setup();
    approve();
    clock.advanceSeconds(11 * 60);
    await service.handle(signedHeaders(clock));
    expect(provider.refunds).toEqual([MP_ID]);
    expect(repository.payments.get(PAYMENT)?.status).toBe('refunded');
    expect(repository.bookings.get(BOOKING)?.status).toBe('held');
    expect(events.events.map((e) => e.type)).toEqual(['payment.refunded']);
  });

  it('records a rejection and later ignores it being approved locally by the app', async () => {
    const { repository, events, service, approve, clock } = setup();
    approve('rejected');
    await service.handle(signedHeaders(clock));
    expect(repository.payments.get(PAYMENT)?.status).toBe('rejected');
    expect(events.events).toHaveLength(0);
  });

  it('moves approved to refunded when the provider reports a refund', async () => {
    const { repository, events, service, approve, clock } = setup();
    approve();
    await service.handle(signedHeaders(clock));
    approve('refunded');
    await service.handle(signedHeaders(clock));
    expect(repository.payments.get(PAYMENT)?.status).toBe('refunded');
    expect(events.events.map((e) => e.type)).toEqual(['payment.approved', 'payment.refunded']);
  });

  it('ignores a payment whose amount differs from ours', async () => {
    const { repository, provider, service, clock } = setup();
    provider.setStatus(MP_ID, `${CLUB}:${PAYMENT}`, 1, 'approved');
    await service.handle(signedHeaders(clock));
    expect(repository.payments.get(PAYMENT)?.status).toBe('pending');
  });

  it('acknowledges other notification types without touching anything', async () => {
    const { repository, service, clock } = setup();
    await service.handle({ ...signedHeaders(clock), type: 'merchant_order' });
    expect(repository.payments.get(PAYMENT)?.status).toBe('pending');
  });
});

describe('POST /v1/webhooks/mercadopago', () => {
  it('answers 401 WEBHOOK_SIGNATURE_INVALID without a signature (no secret configured)', async () => {
    const { app } = await createTestApp();
    const response = await request(app.getHttpServer())
      .post('/v1/webhooks/mercadopago?data.id=1&type=payment')
      .set('x-request-id', 'r')
      .send({ type: 'payment', data: { id: '1' } })
      .expect(401);
    expect((response.body as { code: string }).code).toBe('WEBHOOK_SIGNATURE_INVALID');
    await app.close();
  });
});
