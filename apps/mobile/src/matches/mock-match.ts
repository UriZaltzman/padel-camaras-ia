// Dev and test mock for the match screen. `withMatchMock` serves GET /matches/{id}, its clips and
// the media links, and passes every other request through. Only reachable when
// shouldUseMockApi is true (never in release builds).
import type { Schema } from '@app/contracts';

import type { Fetch } from '../auth/authed-fetch';

export const MOCK_MATCH_ID = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b';
export const MOCK_FULL_VIDEO_ID = '0192af6e-7c1a-7d4e-9b3a-2f6c8e1d4a51';
const uuid = (n: number) => `0192af6e-7c1a-7d4e-9b3a-2f6c8e1d4b${String(n).padStart(2, '0')}`;

const media = (id: string, kind: 'full' | 'clip', ms: number): Schema<'MediaAsset'> => ({
  id,
  kind,
  status: 'ready',
  duration_ms: ms,
  expires_at: null,
});

export function mockMatch(overrides: Partial<Schema<'MatchDetail'>> = {}): Schema<'MatchDetail'> {
  const player = (position: 1 | 2 | 3 | 4, team: 1 | 2, name: string) => ({
    position,
    team,
    user: { id: uuid(position), display_name: name, photo_url: null },
    confirmed: true,
    thumbnail_media_id: null,
    stats: null,
  });
  return {
    id: MOCK_MATCH_ID,
    type: 'match',
    status: 'published',
    starts_at: '2026-10-15T22:00:00Z',
    ends_at: '2026-10-15T23:30:00Z',
    club: { id: uuid(60), name: 'Pádel Norte' },
    court: { id: uuid(61), name: 'Cancha 2' },
    booking_id: null,
    golden_point: true,
    sets: [
      { team_1: 6, team_2: 4 },
      { team_1: 3, team_2: 6 },
      { team_1: 7, team_2: 5 },
    ],
    winner_team: 1,
    players: [
      player(1, 1, 'Sofía Pérez'),
      player(2, 1, 'Martín Gómez'),
      player(3, 2, 'Lucía Díaz'),
      player(4, 2, 'Nico Romero'),
    ],
    points_to_review: [
      {
        id: uuid(10),
        number: 12,
        set: 1,
        game: 3,
        winner_team: 1,
        end_reason: 'double_bounce',
        confidence: 0.55,
        clip_media_id: uuid(20),
      },
      {
        id: uuid(11),
        number: 31,
        set: 2,
        game: 2,
        winner_team: 2,
        end_reason: 'out_after_bounce',
        confidence: 0.62,
        clip_media_id: uuid(21),
      },
    ],
    insights: null,
    full_video: media(MOCK_FULL_VIDEO_ID, 'full', 5_400_000),
    reel: null,
    published_at: '2026-10-16T00:30:00Z',
    ...overrides,
  };
}

export const mockClips: Schema<'Clip'>[] = [
  {
    id: uuid(30),
    match_id: MOCK_MATCH_ID,
    source: 'auto',
    start_ms: 600_000,
    end_ms: 620_000,
    highlight_score: 0.9,
    created_by_user_id: null,
    media: media(uuid(40), 'clip', 20_000),
    thumbnail_media_id: null,
    created_at: '2026-10-16T00:30:00Z',
  },
];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'mock' },
  });

export function withMatchMock(next: Fetch, match = mockMatch()): Fetch {
  return async (input) => {
    const path = new URL(input.url).pathname.replace(/^.*\/v1/, '');
    if (input.method === 'GET') {
      if (path === `/matches/${match.id}`) return json(match);
      if (path === `/matches/${match.id}/clips`)
        return json({ items: mockClips, next_cursor: null });
      const mediaId = /^\/media\/([^/]+)\/url$/.exec(path)?.[1];
      if (mediaId) {
        return json({
          media_id: mediaId,
          // Public sample clip: the mock never signs anything real.
          url: 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          content_type: 'video/mp4',
        });
      }
    }
    const downloadId = /^\/media\/([^/]+)\/download$/.exec(path)?.[1];
    if (input.method === 'POST' && downloadId) {
      return json({ media_id: downloadId, status: 'preparing', url: null, expires_at: null });
    }
    return next(input);
  };
}
