import type { Schema } from '@app/contracts';
import { describe, expect, it } from 'vitest';

import { t } from '@/i18n';
import { parseEnv } from '@/lib/env';

import { mockFetch } from './mock-fetch';

describe('API mock', () => {
  it('answers with the contract Error body', async () => {
    const response = await mockFetch('http://localhost:3000/v1/anything');
    const body = (await response.json()) as Schema<'Error'>;

    expect(response.status).toBe(503);
    expect(body).toEqual({ code: 'SERVICE_UNAVAILABLE', message: t('api.mockUnavailable') });
  });
});

describe('parseEnv', () => {
  it('defaults to the local API with the mock on', () => {
    expect(parseEnv({})).toEqual({
      NEXT_PUBLIC_API_URL: 'http://localhost:3000/v1',
      NEXT_PUBLIC_API_MOCK: true,
    });
  });

  it('rejects an invalid API URL', () => {
    expect(() => parseEnv({ NEXT_PUBLIC_API_URL: 'not a url' })).toThrow();
  });
});
