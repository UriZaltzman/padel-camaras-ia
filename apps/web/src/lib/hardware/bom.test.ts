import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseBom, quote } from './bom';

const REAL = readFileSync(
  path.resolve(__dirname, '../../../../../infra/hardware/bom.yaml'),
  'utf8',
);

describe('quote from infra/hardware/bom.yaml', () => {
  it('matches the control line of the file: 4 courts = US$4.320', () => {
    const q = quote(parseBom(REAL), 4);
    expect(q.usdTotal).toBe(4320);
    expect(q.arsTotalCents).toBe(663_120_000);
    expect(q.arsPurchasePlanCents).toBe(828_900_000);
    expect(q.isEstimate).toBe(true);
  });

  it('changing a price in the file changes the quote without touching code', () => {
    const before = quote(parseBom(REAL), 2);
    const edited = REAL.replace('usd_estimated_total: 1300', 'usd_estimated_total: 1400');
    expect(edited).not.toBe(REAL);
    const after = quote(parseBom(edited), 2);
    expect(after.usdTotal).toBe(before.usdTotal + 100);
    expect(after.arsTotalCents).toBe(before.arsTotalCents + 100 * 1535 * 100);
  });

  it('changing the markup or the exchange rate moves the purchase plan', () => {
    const doubled = REAL.replace('markup_purchase_plan: 0.25', 'markup_purchase_plan: 0.5');
    expect(quote(parseBom(doubled), 1).arsPurchasePlanCents).toBe(
      Math.round(quote(parseBom(doubled), 1).arsTotalCents * 1.5),
    );
  });

  it('stops being an estimate once every item is quoted', () => {
    const quoted = REAL.replaceAll('TODO_COTIZAR }', 'QUOTED }');
    expect(quote(parseBom(quoted), 1).isEstimate).toBe(false);
  });

  it('rejects a malformed file and a bad court count', () => {
    expect(() => parseBom('fx_ars_per_usd: "1535"')).toThrow();
    expect(() => quote(parseBom(REAL), 0)).toThrow(RangeError);
  });
});
