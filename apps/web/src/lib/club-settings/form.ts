// Form model of the court settings panel and its validation. The form keeps pesos as typed text;
// `toCourtSettingsUpdate` turns a valid form into the contract body with integer cents. The checks
// mirror `CourtBookingSettings` in packages/contracts (schema rules plus the cross-field rules the
// API answers with VALIDATION_FAILED: overlapping rules, price bands with gaps or overlaps, a
// missing price for an allowed duration).
import type { Schema } from '@app/contracts';
import { z } from 'zod';

import { t } from '@/i18n';

import { centsToPesosInput, pesosToCents } from './money';

export type Weekday = Schema<'Weekday'>;
export type Duration = Schema<'BookingDuration'>;
export type StartInterval = Schema<'BookingRule'>['start_interval_minutes'];
export type DepositType = Schema<'Deposit'>['type'];

export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DURATIONS: readonly Duration[] = [60, 90, 120];
export const START_INTERVALS: readonly NonNullable<StartInterval>[] = [15, 30, 60];
export const DEPOSIT_TYPES: readonly DepositType[] = ['none', 'percent', 'fixed'];
export const DEFAULT_START_INTERVAL = 30;
export const DEFAULT_CANCELLATION_HOURS = 24;

/** Times offered in the selects: every 15 minutes, `24:00` meaning the end of the day. */
export const TIME_OPTIONS: readonly string[] = Array.from({ length: 97 }, (_, i) => {
  const minutes = i * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

export interface BandForm {
  startsAt: string;
  endsAt: string;
  /** Pesos as typed, per duration. */
  prices: Record<Duration, string>;
}

export interface RuleForm {
  days: Weekday[];
  opensAt: string;
  closesAt: string;
  allowedDurations: Duration[];
  startInterval: NonNullable<StartInterval>;
  bands: BandForm[];
}

export interface CourtForm {
  courtId: string;
  name: string;
  rules: RuleForm[];
  depositType: DepositType;
  depositPercent: string;
  depositPesos: string;
  cancellationHours: string;
}

const emptyPrices = (): Record<Duration, string> => ({ 60: '', 90: '', 120: '' });

export function newBand(startsAt: string, endsAt: string): BandForm {
  return { startsAt, endsAt, prices: emptyPrices() };
}

export function newRule(): RuleForm {
  return {
    days: [...WEEKDAYS],
    opensAt: '08:00',
    closesAt: '24:00',
    allowedDurations: [...DURATIONS],
    startInterval: DEFAULT_START_INTERVAL,
    bands: [newBand('08:00', '24:00')],
  };
}

export function courtToForm(court: Schema<'Court'>): CourtForm {
  const { deposit } = court.booking;
  return {
    courtId: court.id,
    name: court.name,
    rules: court.booking.rules.map((rule) => ({
      days: [...rule.days],
      opensAt: rule.opens_at,
      closesAt: rule.closes_at,
      allowedDurations: [...rule.allowed_durations],
      startInterval: rule.start_interval_minutes ?? DEFAULT_START_INTERVAL,
      bands: rule.price_bands.map((band) => {
        const prices = emptyPrices();
        for (const price of band.prices) {
          prices[price.duration_minutes] = centsToPesosInput(price.amount_cents);
        }
        return { startsAt: band.starts_at, endsAt: band.ends_at, prices };
      }),
    })),
    depositType: deposit.type,
    depositPercent: deposit.type === 'percent' ? String(deposit.percent) : '',
    depositPesos: deposit.type === 'fixed' ? centsToPesosInput(deposit.amount_cents) : '',
    cancellationHours: String(
      court.booking.cancellation_refund_hours ?? DEFAULT_CANCELLATION_HOURS,
    ),
  };
}

/** `HH:MM` to minutes since midnight; `24:00` is 1440. */
export function toMinutes(time: string): number {
  const [h = '0', m = '0'] = time.split(':');
  return Number(h) * 60 + Number(m);
}

const localTime = z.string().regex(/^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$/);
const wholeNumber = (min: number, max: number) =>
  z.string().trim().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max));

const bandSchema = z.object({
  startsAt: localTime,
  endsAt: localTime,
  prices: z.record(z.enum(['60', '90', '120']), z.string()),
});

const ruleSchema = z.object({
  days: z.array(z.enum(WEEKDAYS as [Weekday, ...Weekday[]])),
  opensAt: localTime,
  closesAt: localTime,
  allowedDurations: z.array(z.union([z.literal(60), z.literal(90), z.literal(120)])),
  startInterval: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  bands: z.array(bandSchema).max(12),
});

/** Zod schema of one court's form, with es-AR messages for every issue. */
export const courtFormSchema = z
  .object({
    courtId: z.string(),
    name: z.string(),
    rules: z.array(ruleSchema).max(14),
    depositType: z.enum(['none', 'percent', 'fixed']),
    depositPercent: z.string(),
    depositPesos: z.string(),
    cancellationHours: z.string(),
  })
  .superRefine((court, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: 'custom', message, path });

    court.rules.forEach((rule, r) => {
      const where = t('courts.where.rule', { court: court.name, rule: r + 1 });
      const opens = toMinutes(rule.opensAt);
      const closes = toMinutes(rule.closesAt);

      if (rule.days.length === 0) issue(t('courts.error.noDays', { where }), ['rules', r, 'days']);
      if (closes <= opens) {
        issue(t('courts.error.hoursOrder', { where }), ['rules', r, 'closesAt']);
      }
      if (rule.allowedDurations.length === 0) {
        issue(t('courts.error.noDurations', { where }), ['rules', r, 'allowedDurations']);
      }
      if (rule.bands.length === 0) {
        issue(t('courts.error.noBands', { where }), ['rules', r, 'bands']);
      }

      // Bands, in the order they start, must cover [opens, closes) without gaps or overlaps.
      const sorted = rule.bands
        .map((band, b) => ({ band, b }))
        .sort((x, y) => toMinutes(x.band.startsAt) - toMinutes(y.band.startsAt));
      let cursor = opens;
      sorted.forEach(({ band, b }, index) => {
        const bandWhere = t('courts.where.band', { court: court.name, rule: r + 1, band: b + 1 });
        const path = ['rules', r, 'bands', b];
        const start = toMinutes(band.startsAt);
        const end = toMinutes(band.endsAt);
        if (end <= start) {
          issue(t('courts.error.bandOrder', { where: bandWhere }), [...path, 'endsAt']);
          return;
        }
        if (index > 0 && start < cursor) {
          issue(t('courts.error.bandOverlap', { where: bandWhere }), [...path, 'startsAt']);
        } else if (index > 0 && start > cursor) {
          issue(t('courts.error.bandGap', { where: bandWhere }), [...path, 'startsAt']);
        }
        cursor = Math.max(cursor, end);

        for (const duration of rule.allowedDurations) {
          const text = band.prices[duration] ?? '';
          if (text.trim() === '') {
            issue(t('courts.error.priceMissing', { where: bandWhere, n: duration }), [
              ...path,
              'prices',
              duration,
            ]);
          } else {
            const cents = pesosToCents(text);
            if (cents === null || cents < 1) {
              issue(t('courts.error.priceInvalid', { where: bandWhere, n: duration }), [
                ...path,
                'prices',
                duration,
              ]);
            }
          }
        }
      });
      const firstStart = sorted[0] ? toMinutes(sorted[0].band.startsAt) : opens;
      if (rule.bands.length > 0 && closes > opens && (firstStart !== opens || cursor !== closes)) {
        issue(t('courts.error.bandCoverage', { where }), ['rules', r, 'bands']);
      }

      // Rules of one court must not overlap on the same day.
      for (let o = 0; o < r; o += 1) {
        const other = court.rules[o];
        if (!other) continue;
        const sharesDay = rule.days.some((day) => other.days.includes(day));
        const overlaps = opens < toMinutes(other.closesAt) && toMinutes(other.opensAt) < closes;
        if (sharesDay && overlaps) {
          issue(t('courts.error.rulesOverlap', { where, other: o + 1 }), ['rules', r, 'days']);
        }
      }
    });

    const courtName = { court: court.name };
    if (
      court.depositType === 'percent' &&
      !wholeNumber(1, 100).safeParse(court.depositPercent).success
    ) {
      issue(t('courts.error.percentInvalid', courtName), ['depositPercent']);
    }
    if (court.depositType === 'fixed') {
      const cents = pesosToCents(court.depositPesos);
      if (cents === null || cents < 1) {
        issue(t('courts.error.amountInvalid', courtName), ['depositPesos']);
      }
    }
    if (!wholeNumber(0, 168).safeParse(court.cancellationHours).success) {
      issue(t('courts.error.hoursInvalid', courtName), ['cancellationHours']);
    }
  });

/** Validation messages of a court form, in order; empty when it can be saved. */
export function validateCourtForm(form: CourtForm): string[] {
  const result = courtFormSchema.safeParse(form);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

function cents(text: string): number {
  const value = pesosToCents(text);
  if (value === null) throw new Error('toCourtSettingsUpdate needs a validated form');
  return value;
}

function deposit(form: CourtForm): Schema<'Deposit'> {
  switch (form.depositType) {
    case 'percent':
      return { type: 'percent', percent: Number(form.depositPercent.trim()) };
    case 'fixed':
      return { type: 'fixed', amount_cents: cents(form.depositPesos) };
    default:
      return { type: 'none' };
  }
}

/** A validated court form as the contract's `CourtSettingsUpdate`, with money in cents. */
export function toCourtSettingsUpdate(form: CourtForm): Schema<'CourtSettingsUpdate'> {
  return {
    court_id: form.courtId,
    booking: {
      rules: form.rules.map((rule) => ({
        days: WEEKDAYS.filter((day) => rule.days.includes(day)),
        opens_at: rule.opensAt,
        closes_at: rule.closesAt,
        allowed_durations: DURATIONS.filter((d) => rule.allowedDurations.includes(d)),
        start_interval_minutes: rule.startInterval,
        price_bands: [...rule.bands]
          .sort((x, y) => toMinutes(x.startsAt) - toMinutes(y.startsAt))
          .map((band) => ({
            starts_at: band.startsAt,
            ends_at: band.endsAt,
            prices: DURATIONS.filter((d) => rule.allowedDurations.includes(d)).map((d) => ({
              duration_minutes: d,
              amount_cents: cents(band.prices[d]),
            })),
          })),
      })),
      deposit: deposit(form),
      cancellation_refund_hours: Number(form.cancellationHours.trim()),
    },
  };
}
