import type { Schema } from '@app/contracts';

import { summarize } from '@/lib/club-cash/model';
import { todayLocal } from '@/lib/player/format';

/**
 * Club side of the cash register mock: `/club-admin/cash-register` (+ `/expenses`, `/close`).
 * Only reached through `createMockFetch` when `NEXT_PUBLIC_API_MOCK` is on (never in production).
 * Today starts with two cash turns, a transfer and a Mercado Pago payment so the screen is not
 * empty in dev; any other day starts empty.
 */
export interface ClubCashMockState {
  days: Map<string, Schema<'CashRegister'>>;
}

// Minimal one-page PDF, enough for the dev link to open something.
const MOCK_PDF =
  'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMjAwIDIwMF0+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+Cg==';

let counter = 0;
const newId = () => `01928f6e-7c1a-7d4e-9b3a-2f6c8e1d${String(5000 + ++counter)}`;

function emptyDay(clubId: string, date: string): Schema<'CashRegister'> {
  return { club_id: clubId, date, status: 'open', movements: [], ...summarize([]) };
}

export function newClubCashMockState(
  clubId: string,
  now: () => Date = () => new Date(),
): ClubCashMockState {
  const date = todayLocal(now());
  const at = now().toISOString();
  const income = (
    method: Schema<'CashPaymentMethod'>,
    amount_cents: number,
    description: string,
  ): Schema<'CashMovement'> => ({
    id: newId(),
    kind: 'income',
    method,
    amount_cents,
    description,
    booking_id: null,
    occurred_at: at,
  });
  const movements = [
    income('cash', 2_000_000, 'Marcos Gil · Cancha 1'),
    income('cash', 1_000_000, 'Lucía Pérez · Cancha 1'),
    income('transfer', 4_000_000, 'Diego Ruiz · Cancha 2'),
    income('mercado_pago', 900_000, 'Seña Sofía Díaz'),
  ];
  return {
    days: new Map([
      [date, { club_id: clubId, date, status: 'open', movements, ...summarize(movements) }],
    ]),
  };
}

type Reply = (status: number, body: unknown) => Response;

export async function handleClubCashRequest(
  request: Request,
  state: ClubCashMockState,
  reply: Reply,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^.*\/v1/, '');
  if (!path.startsWith('/club-admin/cash-register')) return null;
  const clubId = url.searchParams.get('club_id') ?? '';
  const fail = (status: number, code: Schema<'ErrorCode'>, message: string) =>
    reply(status, { code, message } satisfies Schema<'Error'>);
  const day = (date: string) => {
    let register = state.days.get(date);
    if (!register) {
      register = emptyDay(clubId, date);
      state.days.set(date, register);
    }
    return register;
  };

  if (request.method === 'GET' && path === '/club-admin/cash-register') {
    const date = url.searchParams.get('date') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, 'VALIDATION_FAILED', 'date');
    return reply(200, day(date));
  }
  if (request.method !== 'POST') return null;
  const body = (await request.json()) as { date?: string };
  const register = day(body.date ?? '');
  if (register.status === 'closed') return fail(409, 'INVALID_STATE_TRANSITION', 'closed');

  if (path === '/club-admin/cash-register/expenses') {
    const e = body as Schema<'CashExpenseCreate'>;
    if (!(e.amount_cents > 0) || !e.description?.trim()) {
      return fail(400, 'VALIDATION_FAILED', 'expense');
    }
    register.movements.push({
      id: newId(),
      kind: 'expense',
      method: 'cash',
      amount_cents: e.amount_cents,
      description: e.description.trim(),
      booking_id: null,
      occurred_at: new Date().toISOString(),
    });
    Object.assign(register, summarize(register.movements));
    return reply(201, register);
  }
  if (path === '/club-admin/cash-register/close') {
    const c = body as Schema<'CashRegisterClose'>;
    if (!(c.counted_cash_cents >= 0)) return fail(400, 'VALIDATION_FAILED', 'counted');
    Object.assign(register, {
      status: 'closed',
      counted_cash_cents: c.counted_cash_cents,
      difference_cents: c.counted_cash_cents - register.expected_cash_cents,
      closed_at: new Date().toISOString(),
      pdf_url: MOCK_PDF,
    });
    return reply(200, register);
  }
  return null;
}
