// Dev and test mock for the home screen. `withHomeMock` serves GET /me/matches from the contract
// example and passes every other request through; `mockNextBooking` stands in for the missing
// "my bookings" endpoint. Only reachable when shouldUseMockApi is true (never in release builds).
import type { Schema } from '@app/contracts';

import type { Fetch } from '../auth/authed-fetch';
import type { NextBooking } from './home-data';

const DAY_MS = 24 * 60 * 60 * 1000;

export const mockLastMatch: Schema<'MatchSummary'> = {
  id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b',
  type: 'match',
  status: 'published',
  starts_at: '2026-10-15T22:00:00Z',
  ends_at: '2026-10-15T23:30:00Z',
  club: { id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60', name: 'Pádel Norte' },
  court: { id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a61', name: 'Cancha 2' },
  team: 1,
  won: true,
  sets: [
    { team_1: 6, team_2: 4 },
    { team_1: 3, team_2: 6 },
    { team_1: 7, team_2: 5 },
  ],
};

export function mockNextBooking(now = Date.now()): NextBooking {
  const start = new Date(Math.ceil((now + 2 * DAY_MS) / (60 * 60 * 1000)) * 60 * 60 * 1000);
  return {
    id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a70',
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 90 * 60 * 1000).toISOString(),
    duration_minutes: 90,
    status: 'confirmed',
    club: { id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60', name: 'Pádel Norte' },
    court: { id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a61', name: 'Cancha 2' },
  };
}

export function withHomeMock(next: Fetch, matches = [mockLastMatch]): Fetch {
  return async (input) => {
    const path = new URL(input.url).pathname.replace(/^.*\/v1/, '');
    if (input.method === 'GET' && path === '/me/matches') {
      return new Response(JSON.stringify({ items: matches, next_cursor: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'mock' },
      });
    }
    return next(input);
  };
}
