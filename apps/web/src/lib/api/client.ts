import { createApiClient } from '@app/contracts';
import type { ApiClient } from '@app/contracts';

import { env } from '@/lib/env';
import type { Env } from '@/lib/env';

import { mockFetch } from './mock-fetch';

/** Typed client for the API (`/v1`), generated from packages/contracts. */
export function buildApiClient(
  settings: Pick<Env, 'NEXT_PUBLIC_API_URL' | 'NEXT_PUBLIC_API_MOCK'>,
) {
  return createApiClient({
    baseUrl: settings.NEXT_PUBLIC_API_URL,
    ...(settings.NEXT_PUBLIC_API_MOCK ? { fetch: mockFetch } : {}),
  });
}

export const apiClient: ApiClient = buildApiClient(env);
