// Dev and test mock of the tournaments API and of the partner lookup. Only wired in when
// shouldUseMockApi is true (dev builds with EXPO_PUBLIC_API_MOCK=true); release builds never
// reach it.
import type { Schema } from '@app/contracts';

import type { Fetch } from '../auth/authed-fetch';
import type { Partner, PartnerFinder } from './tournament-data';

export const MOCK_CLUB_ID = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60';
export const MOCK_ME_ID = '0192af6e-0000-7d4e-9b3a-2f6c8e1d4c01';
const ID = (n: number) => `0192af6e-1111-7d4e-9b3a-2f6c8e1d4c${String(n).padStart(2, '0')}`;

export const mockPartners: Partner[] = [
  { user_id: ID(10), name: 'Martín Gómez' },
  { user_id: ID(11), name: 'Lucía Pérez' },
];

const points = { champion: 100, finalist: 60, semifinal: 36, quarterfinal: 18, group_win: 5 };

export const mockOpenTournament: Schema<'Tournament'> = {
  id: ID(1),
  club_id: MOCK_CLUB_ID,
  name: 'Copa Primavera',
  category: 5,
  status: 'registration',
  entry_fee_cents: 2000000,
  match_minutes: 60,
  points,
  pair_count: 6,
} as Schema<'Tournament'>;

export const mockRunningTournament: Schema<'Tournament'> = {
  ...mockOpenTournament,
  id: ID(2),
  name: 'Torneo Apertura',
  status: 'in_progress',
  entry_fee_cents: 0,
  pair_count: 4,
};

function pair(n: number, players: [string, string], id: string, group: string, paid = true) {
  return {
    id: ID(n),
    players: [
      { user_id: id, name: players[0] },
      { user_id: ID(n + 40), name: players[1] },
    ],
    seed: n - 19,
    group_id: group,
    paid,
  };
}

/** A drawn tournament where the mock user plays on pair 20 (with the next match on pair 20's side). */
export function mockRunningDetail(): Schema<'TournamentDetail'> {
  const group = ID(30);
  const pairs = [
    pair(20, ['Yo', 'Sofía Ruiz'], MOCK_ME_ID, group),
    pair(21, ['Ana Díaz', 'Bruno Sosa'], ID(60), group),
    pair(22, ['Carla Vega', 'Diego Paz'], ID(61), group),
    pair(23, ['Elena Gil', 'Fede Ríos'], ID(62), group),
  ];
  const stand = (n: number, wins: number, played: number) => ({
    pair_id: ID(n),
    played,
    wins,
    sets_for: wins * 2,
    sets_against: played - wins,
    games_for: wins * 12,
    games_against: (played - wins) * 12 + 6,
  });
  return {
    ...mockRunningTournament,
    pairs,
    groups: [
      {
        id: group,
        position: 0,
        pair_ids: pairs.map((p) => p.id),
        standings: [stand(21, 1, 1), stand(20, 0, 1), stand(22, 0, 0), stand(23, 0, 0)],
      },
    ],
    matches: [
      {
        id: ID(70),
        stage: 'group',
        group_id: group,
        round: 1,
        pair_a_id: ID(20),
        pair_b_id: ID(21),
        court_id: ID(80),
        starts_at: '2026-10-24T13:00:00Z',
        ends_at: '2026-10-24T14:00:00Z',
        status: 'confirmed',
        sets: [
          { team_1: 4, team_2: 6 },
          { team_1: 3, team_2: 6 },
        ],
        winner_pair_id: ID(21),
        reported_by_user_id: null,
      },
      {
        id: ID(71),
        stage: 'group',
        group_id: group,
        round: 2,
        pair_a_id: ID(22),
        pair_b_id: ID(20),
        court_id: ID(80),
        starts_at: '2026-10-25T15:00:00Z',
        ends_at: '2026-10-25T16:00:00Z',
        status: 'scheduled',
        sets: null,
        winner_pair_id: null,
        reported_by_user_id: null,
      },
    ],
  } as Schema<'TournamentDetail'>;
}

export function mockOpenDetail(): Schema<'TournamentDetail'> {
  return {
    ...mockOpenTournament,
    pairs: [],
    groups: [],
    matches: [],
  } as Schema<'TournamentDetail'>;
}

export function createMockPartnerFinder(): PartnerFinder {
  return {
    search: (q) =>
      Promise.resolve(
        mockPartners.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())),
      ),
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'mock' },
  });

export function withTournamentsMock(next: Fetch): Fetch {
  return async (input) => {
    const path = new URL(input.url).pathname.replace(/^.*\/v1/, '');
    const base = `/clubs/${MOCK_CLUB_ID}/tournaments`;
    if (input.method === 'GET' && path === base) {
      return json({ items: [mockOpenTournament, mockRunningTournament] });
    }
    if (input.method === 'GET' && path === `${base}/${mockOpenTournament.id}`) {
      return json(mockOpenDetail());
    }
    if (input.method === 'GET' && path === `${base}/${mockRunningTournament.id}`) {
      return json(mockRunningDetail());
    }
    if (input.method === 'POST' && path === `${base}/${mockOpenTournament.id}/registrations`) {
      return json(pair(24, ['Yo', 'Compañero'], MOCK_ME_ID, ID(30), false), 201);
    }
    return next(input);
  };
}
