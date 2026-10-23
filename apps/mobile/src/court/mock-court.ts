// Dev and test mock of the court-QR lookup and join. Only wired in when shouldUseMockApi is
// true (dev builds with EXPO_PUBLIC_API_MOCK=true); release builds never import it.
import type { CourtJoinService, CourtSession } from './court-join';

export const MOCK_COURT_ID = '0192af6e-7c1a-7d4e-9b3a-2f6c8e1d4b61';
export const MOCK_COURT_MATCH_ID = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b';

export function mockCourtSession(overrides: Partial<CourtSession> = {}): CourtSession {
  return {
    court: { id: MOCK_COURT_ID, name: 'Cancha 2' },
    club: { id: '0192af6e-7c1a-7d4e-9b3a-2f6c8e1d4b60', name: 'Pádel Norte' },
    booking: {
      id: '0192af6e-7c1a-7d4e-9b3a-2f6c8e1d4b62',
      match_id: MOCK_COURT_MATCH_ID,
      starts_at: '2026-10-23T22:30:00Z',
      ends_at: '2026-10-24T00:00:00Z',
      taken_positions: [1],
    },
    ai_video: 'club_pays',
    free_session_allowed: false,
    extra_amount_cents: null,
    player_has_access: true,
    ...overrides,
  };
}

export function createMockCourtService(
  session: CourtSession = mockCourtSession(),
): CourtJoinService & { joined: number[] } {
  const joined: number[] = [];
  return {
    joined,
    resolve: () => Promise.resolve(session),
    join: (_courtId, position) => {
      if (session.booking?.taken_positions.includes(position) || joined.includes(position)) {
        return Promise.reject(new Error('MATCH_PLAYER_SLOT_TAKEN'));
      }
      joined.push(position);
      return Promise.resolve({ match_id: session.booking?.match_id ?? MOCK_COURT_MATCH_ID });
    },
  };
}
