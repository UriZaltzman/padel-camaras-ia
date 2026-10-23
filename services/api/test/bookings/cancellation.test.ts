import { beforeEach, describe, expect, it } from 'vitest';
import { CancellationService } from '../../src/bookings/cancellation.service';
import {
  CancellationRepository,
  type CancelTarget,
  type StaffClub,
} from '../../src/bookings/cancellation.repository';
import { refundableInTime, resolveRefundHours } from '../../src/bookings/cancellation-policy';
import { FakeClock } from '../../src/common/clock';
import { loadEnv } from '../../src/config/env';
import type { AppError } from '../../src/errors/app-error';
import { RecordingPaymentEvents } from '../../src/payments/payment-events';
import { FakePaymentProvider } from '../../src/payments/payment-provider';
import { VALID_ENV } from '../helpers';

const CLUB = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e01';
const BOOKING = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e03';
const OWNER = { userId: '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e02', sessionId: 's' };
const OTHER = { userId: '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e09', sessionId: 's' };
const STAFF = { userId: '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e0a', sessionId: 's' };
// Clock: 2026-11-01T12:00Z.
const IN_30H = new Date('2026-11-02T18:00:00.000Z');
const IN_5H = new Date('2026-11-01T17:00:00.000Z');

class FakeCancellationRepo extends CancellationRepository {
  constructor(public booking: CancelTarget) {
    super();
  }
  staffClubs(userId: string): Promise<StaffClub[]> {
    return Promise.resolve(userId === STAFF.userId ? [{ clubId: CLUB, role: 'staff' }] : []);
  }
  find(actor: { role: string; userId: string }, id: string): Promise<CancelTarget | null> {
    const b = this.booking;
    if (id !== b.id) return Promise.resolve(null);
    const visible = actor.role === 'staff' || [b.firstPlayerId, 'p2'].includes(actor.userId);
    return Promise.resolve(visible ? { ...b } : null);
  }
  markCancelled(_c: string, _id: string, now: Date): Promise<boolean> {
    if (this.booking.status !== 'confirmed') return Promise.resolve(false);
    this.booking.status = 'cancelled';
    this.booking.cancelledAt = now;
    return Promise.resolve(true);
  }
  markNoShow(): Promise<boolean> {
    if (this.booking.status !== 'confirmed') return Promise.resolve(false);
    this.booking.status = 'no_show';
    return Promise.resolve(true);
  }
  cancelledWithOpenDeposit(): Promise<CancelTarget[]> {
    return Promise.resolve(this.booking.status === 'cancelled' ? [{ ...this.booking }] : []);
  }
}

function setup(over: Partial<CancelTarget> = {}) {
  const repo = new FakeCancellationRepo({
    id: BOOKING,
    clubId: CLUB,
    startsAt: IN_30H,
    status: 'confirmed',
    cancelledAt: null,
    depositPaidCents: 1000,
    createdByUserId: OWNER.userId,
    firstPlayerId: OWNER.userId,
    courtRefundHours: 24,
    clubRefundHours: null,
    deposit: { paymentId: 'pay', providerPaymentId: 'mp-1', status: 'approved' },
    ...over,
  });
  const provider = new FakePaymentProvider();
  const clock = new FakeClock();
  const service = new CancellationService(
    repo,
    provider,
    new RecordingPaymentEvents(),
    clock,
    loadEnv(VALID_ENV),
  );
  return { repo, provider, service };
}

const code = async (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e: AppError) => e.code,
  );

describe('refund window', () => {
  it('resolves court, then club, then 24 hours', () => {
    expect(resolveRefundHours(12, 48)).toBe(12);
    expect(resolveRefundHours(null, 48)).toBe(48);
    expect(resolveRefundHours(undefined, null)).toBe(24);
  });
  it('is inclusive at the boundary', () => {
    const s = new Date('2026-11-02T12:00:00Z');
    expect(refundableInTime(s, new Date('2026-11-01T12:00:00Z'), 24)).toBe(true);
    expect(refundableInTime(s, new Date('2026-11-01T12:00:01Z'), 24)).toBe(false);
  });
});

describe('cancel', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => (t = setup()));

  it('refunds the whole deposit inside the window', async () => {
    const r = await t.service.cancel(OWNER, BOOKING);
    expect(r).toMatchObject({ refund_cents: 1000, refund_status: 'pending', status: 'cancelled' });
    expect(t.provider.refunds).toEqual(['mp-1']);
  });

  it('keeps the deposit outside the window', async () => {
    t = setup({ startsAt: IN_5H });
    const r = await t.service.cancel(OWNER, BOOKING);
    expect(r).toMatchObject({ refund_cents: 0, refund_status: 'none' });
    expect(t.provider.refunds).toEqual([]);
  });

  it('uses the club window when the court sets none', async () => {
    t = setup({ startsAt: IN_5H, courtRefundHours: null, clubRefundHours: 2 });
    expect((await t.service.cancel(OWNER, BOOKING)).refund_cents).toBe(1000);
  });

  it('cancels without refund when no deposit was paid', async () => {
    t = setup({ deposit: null, depositPaidCents: 0 });
    expect((await t.service.cancel(OWNER, BOOKING)).refund_status).toBe('none');
  });

  it('lets staff cancel and rejects other players and strangers', async () => {
    expect(await code(t.service.cancel(STAFF, BOOKING))).toBe('ok');
    t = setup({ firstPlayerId: 'p1' });
    expect(await code(t.service.cancel({ userId: 'p2', sessionId: 's' }, BOOKING))).toBe(
      'FORBIDDEN',
    );
    expect(await code(t.service.cancel(OTHER, BOOKING))).toBe('NOT_FOUND');
  });

  it('rejects held and already cancelled bookings', async () => {
    t = setup({ status: 'held' });
    expect(await code(t.service.cancel(OWNER, BOOKING))).toBe('INVALID_STATE_TRANSITION');
    t = setup();
    await t.service.cancel(OWNER, BOOKING);
    expect(await code(t.service.cancel(OWNER, BOOKING))).toBe('INVALID_STATE_TRANSITION');
  });

  it('cancels anyway when the provider fails, and retries later', async () => {
    t.provider.refund = () => Promise.reject(new Error('down'));
    expect(await code(t.service.cancel(OWNER, BOOKING))).toBe('PAYMENT_PROVIDER_ERROR');
    expect(t.repo.booking.status).toBe('cancelled');
    const ok = new FakePaymentProvider();
    (t.service as unknown as { provider: unknown }).provider = ok;
    expect(await t.service.retryPendingRefunds(CLUB)).toBe(1);
    expect(ok.refunds).toEqual(['mp-1']);
  });
});

describe('club closure (rain)', () => {
  it('refunds even late, staff only', async () => {
    const t = setup({ startsAt: IN_5H });
    expect(await code(t.service.cancelByClub(OWNER, BOOKING))).toBe('FORBIDDEN');
    const r = await t.service.cancelByClub(STAFF, BOOKING);
    expect(r.refund_cents).toBe(1000);
  });
});

describe('no-show', () => {
  it('marks a started booking and keeps the deposit', async () => {
    const t = setup({ startsAt: new Date('2026-11-01T11:00:00.000Z') });
    await t.service.markNoShow(STAFF, BOOKING);
    expect(t.repo.booking.status).toBe('no_show');
    expect(t.provider.refunds).toEqual([]);
  });
  it('rejects players, and bookings that have not started', async () => {
    const t = setup();
    expect(await code(t.service.markNoShow(OWNER, BOOKING))).toBe('FORBIDDEN');
    expect(await code(t.service.markNoShow(STAFF, BOOKING))).toBe('INVALID_STATE_TRANSITION');
  });
});
