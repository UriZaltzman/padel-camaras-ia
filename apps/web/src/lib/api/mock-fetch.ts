import type { Schema } from '@app/contracts';

import { t } from '@/i18n';

import { demoClub } from './mock-data';

/**
 * Stand-in for the API while endpoints do not exist yet, only used when `NEXT_PUBLIC_API_MOCK` is
 * on (never in production builds, see lib/env.ts). Operations listed here answer like the
 * contract; any other request gets the contract's `Error` body with 503, so screens can be built
 * against the typed client and its error path.
 */
export function createMockFetch(seed: Schema<'Club'> = demoClub): typeof fetch {
  // In-memory copy, so a PATCH is seen by the next GET in the same session.
  let club: Schema<'Club'> = structuredClone(seed);

  return async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const { pathname } = new URL(request.url);
    const match = /\/clubs\/([^/]+)(\/settings)?$/.exec(pathname);

    if (match && match[1] === club.id && !match[2] && request.method === 'GET') {
      return json(200, club);
    }
    if (match && match[1] === club.id && match[2] && request.method === 'PATCH') {
      const body = (await request.json()) as Schema<'ClubSettingsUpdate'>;
      const unknown = body.courts?.find(
        (c) => !club.courts.some((court) => court.id === c.court_id),
      );
      if (unknown) return error(404, 'NOT_FOUND', t('api.notFound'));
      club = {
        ...club,
        ...(body.charges ? { charges: body.charges } : {}),
        courts: club.courts.map((court) => {
          const update = body.courts?.find((c) => c.court_id === court.id);
          return update ? { ...court, booking: update.booking } : court;
        }),
      };
      return json(200, club);
    }
    if (match && match[1] !== club.id) return error(404, 'NOT_FOUND', t('api.notFound'));
    return error(503, 'SERVICE_UNAVAILABLE', t('api.mockUnavailable'));
  };
}

export const mockFetch: typeof fetch = createMockFetch();

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(status: number, code: Schema<'ErrorCode'>, message: string): Response {
  const body: Schema<'Error'> = { code, message };
  return json(status, body);
}
