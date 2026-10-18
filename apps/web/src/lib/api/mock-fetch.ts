import type { Schema } from '@app/contracts';

import { t } from '@/i18n';

/**
 * Stand-in for the API while endpoints do not exist yet. It answers every request with the
 * contract's `Error` body, so screens can be built against the typed client and its error path.
 * Real responses per operation are added here as the contract grows.
 */
export const mockFetch: typeof fetch = async () => {
  const body: Schema<'Error'> = {
    code: 'SERVICE_UNAVAILABLE',
    message: t('api.mockUnavailable'),
  };
  return new Response(JSON.stringify(body), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
};
