/** The contract's club shapes, as plain data (`Club`, `ClubSummary`, `ChargeSettings`, ...). */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface DurationPrice {
  duration_minutes: 60 | 90 | 120;
  amount_cents: number;
}
export interface PriceBand {
  starts_at: string;
  ends_at: string;
  prices: DurationPrice[];
}
export interface BookingRule {
  days: Weekday[];
  opens_at: string;
  closes_at: string;
  allowed_durations: (60 | 90 | 120)[];
  start_interval_minutes: 15 | 30 | 60;
  price_bands: PriceBand[];
}
export type Deposit =
  { type: 'none' } | { type: 'percent'; percent: number } | { type: 'fixed'; amount_cents: number };
export interface CourtBookingSettings {
  rules: BookingRule[];
  deposit: Deposit;
  cancellation_refund_hours: number;
}
export interface CourtDto {
  id: string;
  name: string;
  covered: boolean;
  status: 'active' | 'maintenance' | 'inactive';
  booking: CourtBookingSettings;
}
export interface ChargeSettings {
  player_extra: { enabled: boolean; amount_cents: number | null };
  coach_plan: { type: 'included' | 'coach_monthly'; monthly_fee_cents?: number };
  lesson_payments_enabled: boolean;
}
export interface ClubDto {
  id: string;
  name: string;
  address: string;
  city: string;
  timezone: string;
  logo_url: string | null;
  sponsor_name: string | null;
  plan: 'loan' | 'purchase';
  courts: CourtDto[];
  charges: ChargeSettings;
}
export interface ClubSummaryDto {
  id: string;
  name: string;
  address: string;
  city: string;
  logo_url: string | null;
  courts_count: number;
}
export interface ClubSettingsUpdate {
  charges?: ChargeSettings;
  courts?: { court_id: string; booking: CourtBookingSettings }[];
}
