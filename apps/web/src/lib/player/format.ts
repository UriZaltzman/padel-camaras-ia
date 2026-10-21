import { locale, timeZone } from '@/i18n';

const money = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

/** Integer ARS cents as pesos, e.g. 2400000 → "$ 24.000". */
export function formatCents(cents: number): string {
  return money.format(Math.round(cents / 100));
}

const time = new Intl.DateTimeFormat(locale, {
  timeZone,
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
});
const dateTime = new Intl.DateTimeFormat(locale, {
  timeZone,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
});

export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

/** Today's `YYYY-MM-DD` in Buenos Aires. */
export function todayLocal(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}
