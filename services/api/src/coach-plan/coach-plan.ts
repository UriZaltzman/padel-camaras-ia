import { z } from 'zod';

/** List price of the paid coach plan: ARS 25.000 per month (estructura.md). */
export const DEFAULT_COACH_MONTHLY_CENTS = 2_500_000;

/** Days a monthly coach payment keeps the plan active. */
export const COACH_PERIOD_DAYS = 30;

/** `included`: covered by the club's fee. `paid`: each coach pays a monthly amount. */
export const coachPlanConfigSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('included') }),
  z.strictObject({
    mode: z.literal('paid'),
    monthly_cents: z.number().int().min(1).default(DEFAULT_COACH_MONTHLY_CENTS),
  }),
]);

export type CoachPlanConfig = z.infer<typeof coachPlanConfigSchema>;

/** A club that never configured the plan covers its coaches in its own fee. */
export const DEFAULT_COACH_PLAN: CoachPlanConfig = { mode: 'included' };

export interface CoachPlanStatus {
  mode: CoachPlanConfig['mode'];
  active: boolean;
  /** Monthly amount a coach owes; null when the club includes the plan. */
  monthly_cents: number | null;
  /** End of the paid period; null when included or never paid. */
  paid_until: string | null;
}

/** Pure rule: is a coach covered at `now`? */
export function isCovered(config: CoachPlanConfig, paidUntil: Date | null, now: Date): boolean {
  if (config.mode === 'included') return true;
  return paidUntil !== null && paidUntil.getTime() > now.getTime();
}

/** A new payment extends the current period if it is still running, else starts at `paidAt`. */
export function extendPeriod(paidUntil: Date | null, paidAt: Date): Date {
  const start = paidUntil && paidUntil.getTime() > paidAt.getTime() ? paidUntil : paidAt;
  return new Date(start.getTime() + COACH_PERIOD_DAYS * 86_400_000);
}
