import type { Schema } from '@app/contracts';

/**
 * Internal console side of the mock: `GET /admin/clubs` and `GET /admin/clubs/{id}`. Only reached
 * through `createMockFetch` when `NEXT_PUBLIC_API_MOCK` is on (never in production builds).
 * Demo data only: no real club, CUIT or person.
 */
const tier = (name: string, min: number, max: number | null): Schema<'PricingTier'> => ({
  name,
  min_active_players: min,
  max_active_players: max,
});

const ROWS: Schema<'AdminClubRow'>[] = [
  row(1, 'Club Demo Norte', 'Vicente López', 'active', 'loan', 0, 0),
  row(2, 'Club Demo Sur', 'Avellaneda', 'overdue', 'purchase', 18_500_000, 17),
  row(3, 'Club Demo Oeste', 'Morón', 'trial', 'loan', 0, 0),
  row(4, 'Club Demo Centro', 'CABA', 'suspended', 'purchase', 42_000_000, 34),
];

function row(
  n: number,
  name: string,
  city: string,
  status: Schema<'AdminClubStatus'>,
  plan: Schema<'ClubPlan'>,
  balance: number,
  overdue: number,
): Schema<'AdminClubRow'> {
  return {
    id: `01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a0${n}`,
    name,
    city,
    status,
    plan,
    tier: tier('Inicial', 0, 100),
    balance_cents: balance,
    last_payment_at: status === 'trial' ? null : '2026-09-28T15:00:00.000Z',
    overdue_days: overdue,
  };
}

function detail(r: Schema<'AdminClubRow'>): Schema<'AdminClubDetail'> {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    plan: r.plan,
    legal: {
      legal_name: `${r.name} S.R.L.`,
      tax_id: '30000000007',
      contact_name: 'Contacto de prueba',
      contact_phone: '+5491100000000',
      contact_email: 'contacto@example.com',
      address: 'Calle de prueba 123',
      city: r.city,
    },
    modules: {
      deposit: { enabled: false, kind: 'percent', percent: null, amount_cents: null },
      branding: { mode: 'generic', logo_url: null, primary_color: null, secondary_color: null },
      lesson_mode: 'app',
      ai_video: 'club_pays',
      tournaments: false,
    },
    tier_usage: { active_players_90d: 42, tier: r.tier, next_tier_at: 101 },
    billing: {
      balance_cents: r.balance_cents,
      overdue_days: r.overdue_days,
      last_payment_at: r.last_payment_at,
    },
    users: [{ id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4b01', name: 'Dueño de prueba', role: 'owner' }],
    recent_audit: [],
    whitelabel_url: 'https://club-demo.example.com',
    created_at: '2026-08-01T12:00:00.000Z',
  };
}

export async function handleAdminRequest(
  request: Request,
  json: (status: number, body: unknown) => Response,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'GET') return null;
  if (/\/admin\/clubs$/.test(url.pathname)) {
    const status = url.searchParams.get('status');
    const q = url.searchParams.get('q')?.toLowerCase();
    const items = ROWS.filter(
      (r) => (!status || r.status === status) && (!q || r.name.toLowerCase().includes(q)),
    );
    const page: Schema<'AdminClubPage'> = { items, next_cursor: null };
    return json(200, page);
  }
  const match = /\/admin\/clubs\/([^/]+)$/.exec(url.pathname);
  if (match) {
    const found = ROWS.find((r) => r.id === match[1]);
    return found
      ? json(200, detail(found))
      : json(404, { code: 'NOT_FOUND', message: 'No encontrado' });
  }
  return null;
}
