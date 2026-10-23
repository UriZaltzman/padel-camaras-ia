import type { Schema } from '@app/contracts';

export type CashRegister = Schema<'CashRegister'>;
export type CashPaymentMethod = Schema<'CashPaymentMethod'>;

export const CASH_METHODS: CashPaymentMethod[] = ['cash', 'transfer', 'card', 'mercado_pago'];

/** Income of `method` on the day, 0 when the API sent no row for it. */
export function incomeFor(register: CashRegister, method: CashPaymentMethod): number {
  return register.totals_by_method.find((m) => m.method === method)?.income_cents ?? 0;
}

/** Derives totals and expected cash from the movements (used by the dev mock). */
export function summarize(movements: Schema<'CashMovement'>[]) {
  const totals = new Map<CashPaymentMethod, number>();
  let expenses = 0;
  for (const m of movements) {
    if (m.kind === 'income') totals.set(m.method, (totals.get(m.method) ?? 0) + m.amount_cents);
    else expenses += m.amount_cents;
  }
  return {
    totals_by_method: CASH_METHODS.map((method) => ({
      method,
      income_cents: totals.get(method) ?? 0,
    })),
    expenses_cents: expenses,
    expected_cash_cents: (totals.get('cash') ?? 0) - expenses,
  };
}

/** Parses a pesos amount typed by the user ("1.500", "1500,50") into integer cents, or null. */
export function parsePesosToCents(input: string): number | null {
  const clean = input.trim().replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}
