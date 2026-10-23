import type { Schema } from '@app/contracts';

// Test data for the API mock: "Club Demo Palermo" of docs/pendientes.md, shaped like the
// contract's `ClubExample`. Never real clubs.
const weekdayRules: Schema<'BookingRule'> = {
  days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  opens_at: '08:00',
  closes_at: '24:00',
  allowed_durations: [60, 90, 120],
  start_interval_minutes: 30,
  price_bands: [
    {
      starts_at: '08:00',
      ends_at: '18:00',
      prices: [
        { duration_minutes: 60, amount_cents: 1_600_000 },
        { duration_minutes: 90, amount_cents: 2_400_000 },
        { duration_minutes: 120, amount_cents: 3_200_000 },
      ],
    },
    {
      starts_at: '18:00',
      ends_at: '24:00',
      prices: [
        { duration_minutes: 60, amount_cents: 2_000_000 },
        { duration_minutes: 90, amount_cents: 3_000_000 },
        { duration_minutes: 120, amount_cents: 4_000_000 },
      ],
    },
  ],
};

export const DEMO_CLUB_ID = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60';

export const demoClub: Schema<'Club'> = {
  id: DEMO_CLUB_ID,
  name: 'Club Demo Palermo',
  address: 'Av. Santa Fe 4000',
  city: 'CABA',
  timezone: 'America/Argentina/Buenos_Aires',
  logo_url: null,
  sponsor_name: null,
  plan: 'loan',
  courts: [
    {
      id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a61',
      name: 'Cancha 1',
      covered: true,
      status: 'active',
      booking: {
        rules: [weekdayRules],
        deposit: { type: 'percent', percent: 30 },
        cancellation_refund_hours: 24,
      },
    },
    {
      id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a62',
      name: 'Cancha 2',
      covered: false,
      status: 'active',
      booking: {
        rules: [],
        deposit: { type: 'none' },
        cancellation_refund_hours: 24,
      },
    },
  ],
  charges: {
    player_extra: { enabled: false, amount_cents: null },
    coach_plan: { type: 'coach_monthly', monthly_fee_cents: 2_500_000 },
    lesson_payments_enabled: true,
  },
  modules: {
    deposit: { enabled: false, kind: 'percent', percent: null, amount_cents: null },
    branding: { mode: 'generic', logo_url: null, primary_color: null, secondary_color: null },
    lesson_mode: 'app',
    ai_video: 'off',
    tournaments: true,
  },
};
