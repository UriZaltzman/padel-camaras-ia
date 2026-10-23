import { z } from 'zod';
import { AppError } from '../errors/app-error';
import {
  WEEKDAYS,
  type BookingRule,
  type ClubSettingsUpdate,
  type CourtBookingSettings,
} from './club-model';

const localTime = z.string().regex(/^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$/);
const duration = z.union([z.literal(60), z.literal(90), z.literal(120)]);
const cents = z.number().int().min(0);

const priceBand = z.object({
  starts_at: localTime,
  ends_at: localTime,
  prices: z
    .array(z.object({ duration_minutes: duration, amount_cents: cents }).strict())
    .min(1)
    .max(3),
});

const bookingRule = z
  .object({
    days: z.array(z.enum(WEEKDAYS)).min(1).max(7),
    opens_at: localTime,
    closes_at: localTime,
    allowed_durations: z.array(duration).min(1).max(3),
    start_interval_minutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).default(30),
    price_bands: z.array(priceBand).min(1).max(12),
  })
  .strict();

const deposit = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }).strict(),
  z.object({ type: z.literal('percent'), percent: z.number().int().min(1).max(100) }).strict(),
  z.object({ type: z.literal('fixed'), amount_cents: z.number().int().min(1) }).strict(),
]);

const courtBooking = z
  .object({
    rules: z.array(bookingRule).max(14),
    deposit,
    cancellation_refund_hours: z.number().int().min(0).max(168).default(24),
  })
  .strict();

const charges = z
  .object({
    player_extra: z
      .object({ enabled: z.boolean(), amount_cents: z.number().int().min(1).nullable() })
      .strict(),
    coach_plan: z
      .object({
        type: z.enum(['included', 'coach_monthly']),
        monthly_fee_cents: z.number().int().min(1).optional(),
      })
      .strict(),
    lesson_payments_enabled: z.boolean(),
  })
  .strict();

/** `ClubSettingsUpdate` of the contract. */
export const clubSettingsUpdateSchema = z
  .object({
    charges: charges.optional(),
    courts: z
      .array(z.object({ court_id: z.uuid(), booking: courtBooking }).strict())
      .min(1)
      .max(50)
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field' });

interface Issue {
  path: string;
  rule: string;
}

const minutes = (time: string): number => {
  const [h = '0', m = '0'] = time.split(':');
  return Number(h) * 60 + Number(m);
};

/**
 * Checks what a schema cannot: fields valid one by one but not together (section "Errors" of
 * `updateClubSettings`). Returns every problem found, as JSON pointers.
 */
export function findSettingsIssues(update: ClubSettingsUpdate): Issue[] {
  const issues: Issue[] = [];
  const { charges: c } = update;
  if (c) {
    if (c.player_extra.enabled && c.player_extra.amount_cents === null) {
      issues.push({ path: '/charges/player_extra/amount_cents', rule: 'required' });
    }
    if (c.coach_plan.type === 'coach_monthly' && c.coach_plan.monthly_fee_cents === undefined) {
      issues.push({ path: '/charges/coach_plan/monthly_fee_cents', rule: 'required' });
    }
  }
  (update.courts ?? []).forEach((court, i) => {
    issues.push(...courtIssues(court.booking, `/courts/${i}/booking`));
  });
  return issues;
}

function courtIssues(booking: CourtBookingSettings, base: string): Issue[] {
  const issues: Issue[] = [];
  booking.rules.forEach((rule, i) => {
    issues.push(...ruleIssues(rule, `${base}/rules/${i}`));
  });
  // Rules of one court must not overlap on the same weekday.
  for (let a = 0; a < booking.rules.length; a += 1) {
    for (let b = a + 1; b < booking.rules.length; b += 1) {
      const ra = booking.rules[a] as BookingRule;
      const rb = booking.rules[b] as BookingRule;
      const shareDay = ra.days.some((day) => rb.days.includes(day));
      const overlap =
        minutes(ra.opens_at) < minutes(rb.closes_at) &&
        minutes(rb.opens_at) < minutes(ra.closes_at);
      if (shareDay && overlap) issues.push({ path: `${base}/rules/${b}`, rule: 'overlap' });
    }
  }
  return issues;
}

function ruleIssues(rule: BookingRule, base: string): Issue[] {
  const issues: Issue[] = [];
  const opens = minutes(rule.opens_at);
  const closes = minutes(rule.closes_at);
  if (opens >= closes) issues.push({ path: `${base}/closes_at`, rule: 'before_opens_at' });
  if (new Set(rule.days).size !== rule.days.length) {
    issues.push({ path: `${base}/days`, rule: 'unique' });
  }

  const bands = [...rule.price_bands].sort((x, y) => minutes(x.starts_at) - minutes(y.starts_at));
  let cursor = opens;
  for (const band of bands) {
    const start = minutes(band.starts_at);
    const end = minutes(band.ends_at);
    if (end <= start) issues.push({ path: `${base}/price_bands`, rule: 'invalid_range' });
    else if (start > cursor) issues.push({ path: `${base}/price_bands`, rule: 'gap' });
    else if (start < cursor) issues.push({ path: `${base}/price_bands`, rule: 'overlap' });
    cursor = Math.max(cursor, end);
  }
  if (cursor < closes) issues.push({ path: `${base}/price_bands`, rule: 'gap' });
  if (cursor > closes) issues.push({ path: `${base}/price_bands`, rule: 'beyond_closes_at' });

  rule.price_bands.forEach((band, i) => {
    const priced = band.prices.map((p) => p.duration_minutes);
    const complete =
      new Set(priced).size === priced.length &&
      priced.length === rule.allowed_durations.length &&
      rule.allowed_durations.every((d) => priced.includes(d));
    if (!complete) issues.push({ path: `${base}/price_bands/${i}/prices`, rule: 'durations' });
  });
  return issues;
}

/** Throws `VALIDATION_FAILED` with the issues, or returns the update unchanged. */
export function assertSettingsValid(update: ClubSettingsUpdate): ClubSettingsUpdate {
  const issues = findSettingsIssues(update);
  if (issues.length > 0) throw new AppError('VALIDATION_FAILED', { issues });
  return update;
}
