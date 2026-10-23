import { ZodError } from 'zod';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakePaymentProvider } from '../../src/payments/payment-provider';
import { DEFAULT_COACH_MONTHLY_CENTS } from '../../src/coach-plan/coach-plan';
import {
  CoachPlanService,
  InMemoryCoachPlanRepository,
} from '../../src/coach-plan/coach-plan.service';

const club = '0190a000-0000-7000-8000-000000000001';
const coach = '0190a000-0000-7000-8000-000000000002';
const now = new Date('2026-11-01T12:00:00.000Z');

describe('coach plan', () => {
  let provider: FakePaymentProvider;
  let service: CoachPlanService;
  beforeEach(() => {
    provider = new FakePaymentProvider();
    service = new CoachPlanService(new InMemoryCoachPlanRepository(), provider);
  });

  it('defaults to included: coaches are covered with no payment', async () => {
    const status = await service.statusOf(club, coach, now);
    expect(status).toMatchObject({ mode: 'included', active: true, monthly_cents: null });
    await expect(service.assertActive(club, coach, now)).resolves.toBeUndefined();
    await expect(service.startPayment(club, coach, 'p1', now)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  it('paid mode: inactive until the monthly payment, then 30 days', async () => {
    await service.configure(club, { mode: 'paid' });
    expect((await service.statusOf(club, coach, now)).monthly_cents).toBe(
      DEFAULT_COACH_MONTHLY_CENTS,
    );
    await expect(service.assertActive(club, coach, now)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    const checkout = await service.startPayment(club, coach, 'p1', now);
    expect(checkout.amount_cents).toBe(2_500_000);
    expect(provider.preferences[0]).toMatchObject({ marketplaceFeeCents: 0, collectorId: null });

    await service.markPaid(club, coach, now);
    const day29 = new Date(now.getTime() + 29 * 86_400_000);
    const day31 = new Date(now.getTime() + 31 * 86_400_000);
    expect((await service.statusOf(club, coach, day29)).active).toBe(true);
    expect((await service.statusOf(club, coach, day31)).active).toBe(false);
  });

  it('paying early extends the running period instead of overlapping it', async () => {
    await service.configure(club, { mode: 'paid', monthly_cents: 1_000_000 });
    await service.markPaid(club, coach, now);
    const until = await service.markPaid(club, coach, new Date(now.getTime() + 10 * 86_400_000));
    expect(until.toISOString()).toBe(new Date(now.getTime() + 60 * 86_400_000).toISOString());
  });

  it('is per coach and per club, and rejects invalid config', async () => {
    await service.configure(club, { mode: 'paid' });
    await service.markPaid(club, coach, now);
    const other = '0190a000-0000-7000-8000-000000000003';
    expect((await service.statusOf(club, other, now)).active).toBe(false);
    await expect(
      service.configure(club, { mode: 'paid', monthly_cents: 0 }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(service.configure(club, { mode: 'free' })).rejects.toBeInstanceOf(ZodError);
  });
});
