import { AppError } from '../errors/app-error';
import { parseInput } from '../common/zod';
import type { PaymentProvider } from '../payments/payment-provider';
import {
  DEFAULT_COACH_PLAN,
  coachPlanConfigSchema,
  extendPeriod,
  isCovered,
  type CoachPlanConfig,
  type CoachPlanStatus,
} from './coach-plan';

export interface CoachPlanRepository {
  config(clubId: string): Promise<CoachPlanConfig | null>;
  saveConfig(clubId: string, config: CoachPlanConfig): Promise<void>;
  paidUntil(clubId: string, coachUserId: string): Promise<Date | null>;
  savePaidUntil(clubId: string, coachUserId: string, paidUntil: Date): Promise<void>;
}

export class InMemoryCoachPlanRepository implements CoachPlanRepository {
  readonly configs = new Map<string, CoachPlanConfig>();
  readonly periods = new Map<string, Date>();
  config(clubId: string) {
    return Promise.resolve(this.configs.get(clubId) ?? null);
  }
  saveConfig(clubId: string, config: CoachPlanConfig) {
    this.configs.set(clubId, config);
    return Promise.resolve();
  }
  paidUntil(clubId: string, coachUserId: string) {
    return Promise.resolve(this.periods.get(`${clubId}:${coachUserId}`) ?? null);
  }
  savePaidUntil(clubId: string, coachUserId: string, paidUntil: Date) {
    this.periods.set(`${clubId}:${coachUserId}`, paidUntil);
    return Promise.resolve();
  }
}

export interface CoachPlanCheckout {
  checkout_url: string;
  amount_cents: number;
}

/** Plan of the club's coaches: covered by the club fee, or paid monthly by each coach. */
export class CoachPlanService {
  constructor(
    private readonly repository: CoachPlanRepository,
    private readonly provider: PaymentProvider,
  ) {}

  async configOf(clubId: string): Promise<CoachPlanConfig> {
    return (await this.repository.config(clubId)) ?? DEFAULT_COACH_PLAN;
  }

  async configure(clubId: string, body: unknown): Promise<CoachPlanConfig> {
    const config = parseInput(coachPlanConfigSchema, body);
    await this.repository.saveConfig(clubId, config);
    return config;
  }

  async statusOf(clubId: string, coachUserId: string, now: Date): Promise<CoachPlanStatus> {
    const config = await this.configOf(clubId);
    const paidUntil =
      config.mode === 'paid' ? await this.repository.paidUntil(clubId, coachUserId) : null;
    return {
      mode: config.mode,
      active: isCovered(config, paidUntil, now),
      monthly_cents: config.mode === 'paid' ? config.monthly_cents : null,
      paid_until: paidUntil ? paidUntil.toISOString() : null,
    };
  }

  /** Guard for coach-only features (lessons): a coach without plan cannot use them. */
  async assertActive(clubId: string, coachUserId: string, now: Date): Promise<void> {
    const status = await this.statusOf(clubId, coachUserId, now);
    if (!status.active) throw new AppError('FORBIDDEN', { reason: 'coach_plan_inactive' });
  }

  /** Payment link for the coach's month. The platform collects it: no marketplace fee. */
  async startPayment(
    clubId: string,
    coachUserId: string,
    paymentId: string,
    now: Date,
  ): Promise<CoachPlanCheckout> {
    const config = await this.configOf(clubId);
    if (config.mode !== 'paid')
      throw new AppError('INVALID_STATE_TRANSITION', { reason: 'plan_included' });
    const preference = await this.provider.createPreference({
      externalReference: `${clubId}:${paymentId}`,
      title: 'coach_plan',
      amountCents: config.monthly_cents,
      marketplaceFeeCents: 0,
      collectorId: null,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });
    return { checkout_url: preference.checkoutUrl, amount_cents: config.monthly_cents };
  }

  /** Approved payment: extends the coach's period by 30 days. */
  async markPaid(clubId: string, coachUserId: string, paidAt: Date): Promise<Date> {
    const current = await this.repository.paidUntil(clubId, coachUserId);
    const next = extendPeriod(current, paidAt);
    await this.repository.savePaidUntil(clubId, coachUserId, next);
    return next;
  }
}
