// Money is stored and sent as integer ARS cents; the panel shows and edits pesos.

/**
 * Parse a pesos amount typed in es-AR style ("16.000", "16000", "16.000,50") into integer cents.
 * Returns null when the text is not a valid non-negative amount with at most 2 decimals.
 * No floating point is involved, so 0,1 + 0,2 never drifts.
 */
export function pesosToCents(text: string): number | null {
  const clean = text.trim().replace(/\s/g, '');
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(clean);
  if (!match) return null;
  const whole = Number((match[1] ?? '').replace(/\./g, ''));
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const cents = whole * 100 + fraction;
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Integer cents to the pesos text shown in an input: "16000" or "16000,50". */
export function centsToPesosInput(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const fraction = cents % 100;
  return fraction === 0 ? String(whole) : `${whole},${String(fraction).padStart(2, '0')}`;
}
