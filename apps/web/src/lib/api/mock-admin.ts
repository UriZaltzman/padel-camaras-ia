import type { Schema } from '@app/contracts';

import { simulateInvoice, validateTiers } from '@/lib/tariffs/model';

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
  const usage = await handleUsageAndTariffs(request, url, json);
  if (usage) return usage;
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

// PLACEHOLDER amounts (decision #253): the real bands and prices are not final, see docs/pendientes.md.
const TARIFFS: Schema<'AdminTariffVersion'>[] = [
  {
    id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4c01',
    name: 'Tarifa de prueba v1',
    effective_from: '2026-10-01',
    tiers: [
      { min_active_players: 0, max_active_players: 100, monthly_cents: 10_000_000 },
      { min_active_players: 101, max_active_players: 400, monthly_cents: 20_000_000 },
      { min_active_players: 401, max_active_players: 1000, monthly_cents: 35_000_000 },
      { min_active_players: 1001, max_active_players: null, monthly_cents: 50_000_000 },
    ],
    module_prices: [
      { module: 'deposit', monthly_cents: 500_000 },
      { module: 'branding_own', monthly_cents: 1_000_000 },
      { module: 'tournaments', monthly_cents: 800_000 },
      { module: 'ai_video_club_pays', monthly_cents: 2_000_000 },
    ],
    published_by: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4b01',
    published_at: '2026-10-21T12:00:00.000Z',
    clubs_on_version: 4,
  },
];

const usageRow = (
  n: number,
  name: string,
  players: number,
  nextAt: number | null,
  nearLimit: boolean,
  cost: number,
  invoiced: number,
): Schema<'AdminUsageRow'> => ({
  club_id: `01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a0${n}`,
  club_name: name,
  period: '2026-10',
  tier_usage: {
    active_players_90d: players,
    tier: {
      name: 'Demo',
      min_active_players: players > 100 ? 101 : 0,
      max_active_players: players > 100 ? 400 : 100,
    },
    next_tier_at: nextAt,
  },
  bookings: players * 6,
  recorded_matches: players * 3,
  storage_gb: players * 1.5,
  video_minutes: players * 40,
  estimated_cost_cents: cost,
  invoiced_cents: invoiced,
  near_limit: nearLimit,
  trend: [players - 20, players - 12, players - 5, players],
});

const USAGE: Schema<'AdminUsageRow'>[] = [
  usageRow(1, 'Club Demo Norte', 42, 101, false, 3_200_000, 10_000_000),
  usageRow(2, 'Club Demo Sur', 95, 101, true, 7_400_000, 10_000_000),
  usageRow(3, 'Club Demo Oeste', 8, 101, false, 600_000, 0),
  usageRow(4, 'Club Demo Centro', 380, 401, true, 24_000_000, 20_000_000),
];

async function handleUsageAndTariffs(
  request: Request,
  url: URL,
  json: (status: number, body: unknown) => Response,
): Promise<Response | null> {
  if (request.method === 'GET' && /\/admin\/usage$/.test(url.pathname)) {
    const near = url.searchParams.get('near_limit') === 'true';
    const page: Schema<'AdminUsagePage'> = {
      items: USAGE.filter((r) => !near || r.near_limit),
      next_cursor: null,
    };
    return json(200, page);
  }
  if (request.method === 'GET' && /\/admin\/tariffs$/.test(url.pathname)) {
    const page: Schema<'AdminTariffVersionPage'> = {
      items: [...TARIFFS].reverse(),
      next_cursor: null,
    };
    return json(200, page);
  }
  if (request.method === 'POST' && /\/admin\/tariffs$/.test(url.pathname)) {
    const body = (await request.json()) as Schema<'AdminTariffVersionCreate'>;
    if (validateTiers(body.tiers)) {
      return json(422, {
        code: 'TARIFF_TIERS_INVALID',
        message: 'Los tramos tienen huecos o se pisan.',
      });
    }
    const version: Schema<'AdminTariffVersion'> = {
      ...body,
      id: `01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4c0${TARIFFS.length + 1}`,
      published_by: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4b01',
      published_at: new Date().toISOString(),
      clubs_on_version: 0,
    };
    TARIFFS.push(version);
    return json(201, version);
  }
  if (request.method === 'POST' && /\/admin\/tariffs\/simulate$/.test(url.pathname)) {
    const body = (await request.json()) as Schema<'AdminInvoiceSimulationRequest'>;
    const version = body.draft ?? TARIFFS.find((v) => v.id === body.tariff_version_id);
    if (!version) return json(404, { code: 'TARIFF_VERSION_NOT_FOUND', message: 'No encontrado' });
    const result = simulateInvoice(version, body.active_players, body.modules);
    return result
      ? json(200, result)
      : json(422, { code: 'TARIFF_TIERS_INVALID', message: 'Los tramos no cubren esa cantidad.' });
  }
  return null;
}
