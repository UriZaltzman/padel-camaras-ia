import { createHmac, timingSafeEqual } from 'node:crypto';

/** A notification older or newer than this against our clock is treated as a replay. */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export interface SignatureInput {
  /** Raw `x-signature` header: `ts=<unix seconds>,v1=<hex>`. */
  signatureHeader: string | undefined;
  requestId: string | undefined;
  /** `data.id` from the query string. */
  dataId: string | undefined;
  secret: string;
  now: Date;
}

export function parseSignatureHeader(header: string): { ts: string; v1: string } | null {
  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2).map((s) => s.trim());
    if (key === 'ts') ts = value;
    if (key === 'v1') v1 = value;
  }
  return ts && v1 ? { ts, v1 } : null;
}

/** `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, omitting parts whose value is missing. */
export function buildManifest(
  dataId: string | undefined,
  requestId: string | undefined,
  ts: string,
) {
  let manifest = '';
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  return `${manifest}ts:${ts};`;
}

export function signManifest(manifest: string, secret: string): string {
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

/** True only for a well-formed, fresh signature that matches (constant-time comparison). */
export function verifyMercadoPagoSignature(input: SignatureInput): boolean {
  if (!input.signatureHeader) return false;
  const parsed = parseSignatureHeader(input.signatureHeader);
  if (!parsed) return false;
  const ts = Number(parsed.ts);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(input.now.getTime() / 1000 - ts) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(
    signManifest(buildManifest(input.dataId, input.requestId, parsed.ts), input.secret),
    'hex',
  );
  const received = Buffer.from(parsed.v1, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
