import { parse } from 'yaml';
import { z } from 'zod';

// Mirrors infra/hardware/src/*/schema.py: same file, same math. Prices are never written here; they
// are read from `infra/hardware/bom.yaml`, so a new quote there changes the result without code.

export const PRICE_STATUS = ['TODO_COTIZAR', 'QUOTED'] as const;

const itemSchema = z.strictObject({
  item: z.string().min(1),
  qty: z.number().int().positive(),
  usd_estimated_total: z.number().int().nonnegative(),
  status: z.enum(PRICE_STATUS),
});

const bomSchema = z.strictObject({
  fx_ars_per_usd: z.number().positive(),
  markup_purchase_plan: z.number().nonnegative(),
  per_court: z.array(itemSchema).min(1),
  per_club: z.array(itemSchema).min(1),
});

export type Bom = z.infer<typeof bomSchema>;
export type BomItem = z.infer<typeof itemSchema>;

export interface Quote {
  courts: number;
  usdPerCourt: number;
  usdPerClub: number;
  usdTotal: number;
  /** Cost in ARS cents (USD total at the file's exchange rate). */
  arsTotalCents: number;
  /** Purchase plan price in ARS cents: cost plus the markup of the file. */
  arsPurchasePlanCents: number;
  /** True while any item still has no real supplier quote. */
  isEstimate: boolean;
}

/** Validate the text of `bom.yaml`. Throws if it is malformed. */
export function parseBom(text: string): Bom {
  return bomSchema.parse(parse(text));
}

const sum = (items: BomItem[]) => items.reduce((total, i) => total + i.usd_estimated_total, 0);

// Integer arithmetic in thousandths avoids float drift: rates in the file have at most 4 decimals.
const SCALE = 10_000;
const scaled = (n: number) => Math.round(n * SCALE);

/** USD to ARS cents, rounded half up. */
function usdToArsCents(bom: Bom, usd: number): number {
  return Math.round((usd * scaled(bom.fx_ars_per_usd) * 100) / SCALE);
}

export function quote(bom: Bom, courts: number): Quote {
  if (!Number.isInteger(courts) || courts < 1) throw new RangeError('courts must be at least 1');
  const usdPerCourt = sum(bom.per_court);
  const usdPerClub = sum(bom.per_club);
  const usdTotal = courts * usdPerCourt + usdPerClub;
  const arsTotalCents = usdToArsCents(bom, usdTotal);
  return {
    courts,
    usdPerCourt,
    usdPerClub,
    usdTotal,
    arsTotalCents,
    arsPurchasePlanCents: Math.round(
      (arsTotalCents * (SCALE + scaled(bom.markup_purchase_plan))) / SCALE,
    ),
    isEstimate: [...bom.per_court, ...bom.per_club].some((i) => i.status === 'TODO_COTIZAR'),
  };
}
