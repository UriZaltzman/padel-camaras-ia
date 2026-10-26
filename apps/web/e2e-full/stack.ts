import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { APIRequestContext } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3300/v1';
export const WEBHOOK_SECRET = process.env.E2E_WEBHOOK_SECRET ?? 'e2e-only-webhook-secret-not-real';

// Ids and phones of the seed (services/api/src/seed): the Palermo club of the web mock.
export const PALERMO = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60';
export const PALERMO_COURT_1 = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a61';
export const PALERMO_STAFF_PHONE = '+5491155501002';
export const PALERMO_PLAYER_PHONE = '+5491155501011';

/** Local date (Buenos Aires) `days` from now, `YYYY-MM-DD`. */
export function localDate(days: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    new Date(Date.now() + days * 24 * 3600 * 1000),
  );
}

/** Logs of the API: from `E2E_API_LOG_FILE` when set, else from the compose service. */
function apiLog(): string {
  const file = process.env.E2E_API_LOG_FILE;
  if (file) return readFileSync(file, 'utf8');
  const compose = process.env.E2E_COMPOSE_FILE;
  if (!compose) throw new Error('Set E2E_COMPOSE_FILE or E2E_API_LOG_FILE to read WhatsApp codes');
  return execFileSync('docker', ['compose', '-f', compose, 'logs', '--no-color', 'api'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** The latest code the API "sent" to `phone` (development prints WhatsApp messages to its log). */
export async function readOtpCode(phone: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const codes: string[] = [];
    for (const line of apiLog().split('\n')) {
      const start = line.indexOf('{');
      if (start < 0 || !line.includes('"to"') || !line.includes(phone)) continue;
      try {
        const entry = JSON.parse(line.slice(start)) as { to?: string; body?: string };
        const code = entry.to === phone ? /\b(\d{6})\b/.exec(entry.body ?? '')?.[1] : undefined;
        if (code) codes.push(code);
      } catch {
        // not a JSON log line
      }
    }
    const last = codes.at(-1);
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No WhatsApp code found in the API log for ${phone}`);
}

export interface Session {
  accessToken: string;
  userId: string;
}

/** Signs a seeded person in through the real OTP endpoints. */
export async function signIn(request: APIRequestContext, phone: string): Promise<Session> {
  const sent = await request.post(`${API_URL}/auth/otp/whatsapp`, { data: { phone } });
  if (sent.status() !== 202) throw new Error(`OTP request failed: ${sent.status()}`);
  const code = await readOtpCode(phone);
  const verified = await request.post(`${API_URL}/auth/otp/verify`, { data: { phone, code } });
  if (!verified.ok())
    throw new Error(`OTP verify failed: ${verified.status()} ${await verified.text()}`);
  const body = (await verified.json()) as { access_token: string; user: { id: string } };
  return { accessToken: body.access_token, userId: body.user.id };
}

export const bearer = (session: Session) => ({ Authorization: `Bearer ${session.accessToken}` });

/** Signed Mercado Pago notification, as the real provider would send it. */
export function webhookHeaders(dataId: string): Record<string, string> {
  const requestId = `e2e-${Date.now()}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const manifest = `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex');
  return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
}
