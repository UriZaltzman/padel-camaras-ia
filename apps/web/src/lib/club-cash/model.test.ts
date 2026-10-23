import { describe, expect, it } from 'vitest';

import { parsePesosToCents, summarize } from './model';

const base = { id: 'x', description: '', occurred_at: '2026-10-22T20:00:00Z' };

describe('club cash model', () => {
  it('expects cash income minus expenses, whatever the other methods took', () => {
    const s = summarize([
      { ...base, kind: 'income', method: 'cash', amount_cents: 500_000 },
      { ...base, kind: 'income', method: 'cash', amount_cents: 300_000 },
      { ...base, kind: 'income', method: 'transfer', amount_cents: 900_000 },
      { ...base, kind: 'expense', method: 'cash', amount_cents: 100_000 },
    ] as never);
    expect(s.expected_cash_cents).toBe(700_000);
    expect(s.expenses_cents).toBe(100_000);
    expect(s.totals_by_method.find((m) => m.method === 'transfer')?.income_cents).toBe(900_000);
  });

  it('parses pesos into cents and rejects junk', () => {
    expect(parsePesosToCents('1.500')).toBe(150_000);
    expect(parsePesosToCents('1500,5')).toBe(150_050);
    expect(parsePesosToCents('')).toBeNull();
    expect(parsePesosToCents('-3')).toBeNull();
    expect(parsePesosToCents('abc')).toBeNull();
  });
});
