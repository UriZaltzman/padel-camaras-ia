// fetch for the generated client: adds the access token and, when the API answers
// 401 ACCESS_TOKEN_EXPIRED, rotates the refresh token once (single flight) and retries.
import { createApiClient } from '@app/contracts';

import type { StoredTokens, TokenStore } from './token-store';

export type Fetch = (input: Request) => Promise<Response>;

export interface AuthedFetchOptions {
  baseUrl: string;
  baseFetch: Fetch;
  store: TokenStore;
  /** Called when the refresh token is rejected: the user must sign in again. */
  onSessionLost: () => void;
}

export function createTokenRefresher({
  baseUrl,
  baseFetch,
  store,
}: Omit<AuthedFetchOptions, 'onSessionLost'>) {
  const raw = createApiClient({ baseUrl, fetch: baseFetch });
  let inFlight: Promise<StoredTokens | null> | null = null;

  async function rotate(): Promise<StoredTokens | null> {
    const current = await store.load();
    if (!current) return null;
    const { data } = await raw.POST('/auth/refresh', {
      body: { refresh_token: current.refresh_token },
    });
    if (!data) {
      await store.clear();
      return null;
    }
    const next = { access_token: data.access_token, refresh_token: data.refresh_token };
    await store.save(next);
    return next;
  }

  return function refresh(): Promise<StoredTokens | null> {
    inFlight ??= rotate().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

async function isExpiredToken(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  try {
    const body = (await response.clone().json()) as { code?: string };
    return body.code === 'ACCESS_TOKEN_EXPIRED';
  } catch {
    return false;
  }
}

export function createAuthedFetch(options: AuthedFetchOptions): Fetch {
  const refresh = createTokenRefresher(options);
  const { baseFetch, store, onSessionLost } = options;

  return async (input) => {
    const retry = input.clone();
    const tokens = await store.load();
    if (tokens && !input.headers.has('Authorization')) {
      input.headers.set('Authorization', `Bearer ${tokens.access_token}`);
    }
    const response = await baseFetch(input);
    if (!tokens || !(await isExpiredToken(response))) return response;

    const next = await refresh();
    if (!next) {
      onSessionLost();
      return response;
    }
    retry.headers.set('Authorization', `Bearer ${next.access_token}`);
    return baseFetch(retry);
  };
}
