import { nth } from '@/test-utils/nth';
import type { Schema } from '@app/contracts';
import { describe, expect, it } from 'vitest';

import { t } from '@/i18n';
import { parseEnv } from '@/lib/env';

import { DEMO_CLUB_ID, demoClub } from './mock-data';
import { createMockFetch, mockFetch } from './mock-fetch';

describe('API mock', () => {
  it('answers unknown operations with the contract Error body', async () => {
    const response = await mockFetch('http://localhost:3000/v1/anything');
    const body = (await response.json()) as Schema<'Error'>;

    expect(response.status).toBe(503);
    expect(body).toEqual({ code: 'SERVICE_UNAVAILABLE', message: t('api.mockUnavailable') });
  });

  it('saves club settings and returns them on the next GET', async () => {
    const fetch = createMockFetch();
    const url = `http://localhost:3000/v1/clubs/${DEMO_CLUB_ID}`;
    const courts = [
      { court_id: nth(demoClub.courts, 1).id, booking: nth(demoClub.courts, 0).booking },
    ];
    const patched = await fetch(`${url}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ courts }),
    });
    expect(patched.status).toBe(200);
    const club = (await (await fetch(url)).json()) as Schema<'Club'>;
    expect(nth(club.courts, 1).booking).toEqual(nth(demoClub.courts, 0).booking);
  });
});

describe('parseEnv', () => {
  it('defaults to the local API with the mock on', () => {
    expect(parseEnv({})).toEqual({
      NEXT_PUBLIC_API_URL: 'http://localhost:3000/v1',
      NEXT_PUBLIC_API_MOCK: true,
    });
  });

  it('never turns the mock on in a production build', () => {
    expect(
      parseEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_MOCK: 'true' }).NEXT_PUBLIC_API_MOCK,
    ).toBe(false);
  });

  it('rejects an invalid API URL', () => {
    expect(() => parseEnv({ NEXT_PUBLIC_API_URL: 'not a url' })).toThrow();
  });
});
