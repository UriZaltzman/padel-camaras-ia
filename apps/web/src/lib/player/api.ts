import type { ApiClient } from '@app/contracts';
import { redirect } from 'next/navigation';

import { buildApiClient } from '@/lib/api/client';
import { env } from '@/lib/env';

import { getAccessToken } from './session';

/** API client with the player's access token. Server only. */
export function playerClient(accessToken: string): ApiClient {
  const client = buildApiClient(env);
  client.use({
    onRequest({ request }) {
      request.headers.set('Authorization', `Bearer ${accessToken}`);
      return request;
    },
  });
  return client;
}

/** The access token, or a redirect to sign-in that comes back to `next`. */
export async function requireAccessToken(next: string): Promise<string> {
  const token = await getAccessToken();
  if (!token) redirect(`/ingresar?next=${encodeURIComponent(next)}`);
  return token;
}

/** Only same-site paths are allowed as the place to return to after sign-in. */
export function safeNext(next: unknown): string {
  return typeof next === 'string' && /^\/(?![/\\])/.test(next) ? next : '/reservar';
}
