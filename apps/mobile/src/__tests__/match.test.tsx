import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { Text } from 'react-native';

import { createApiClient } from '@app/contracts';

import { ApiProvider } from '../api/client';
import { i18n } from '../i18n';
import { esAR } from '../i18n/locales';
import { canClaim, filterPoints, statsAreApproximate } from '../matches/match-data';
import { MatchScreen } from '../matches/MatchScreen';
import type { MatchVideoComponent } from '../matches/MatchVideo';
import { MOCK_MATCH_ID, mockMatch, withMatchMock } from '../matches/mock-match';

jest.mock('../auth/session', () => ({
  useSession: () => ({ user: { id: '0192af6e-7c1a-7d4e-9b3a-2f6c8e1d4b01' } }),
}));

const m = esAR.match;
const notFound = () => Promise.resolve(new Response('{}', { status: 404 }));
const calls: string[] = [];
const FakeVideo: MatchVideoComponent = ({ uri, startMs }) => (
  <Text testID="fake-video">{`${uri}|${startMs}`}</Text>
);

async function renderMatch(match = mockMatch()) {
  const base = withMatchMock(notFound, match);
  const fetch = (input: Request) => {
    calls.push(`${input.method} ${new URL(input.url).pathname}`);
    return base(input);
  };
  const client = createApiClient({ baseUrl: 'http://test/v1', fetch });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ApiProvider client={client} queryClient={queryClient}>
      <MatchScreen matchId={MOCK_MATCH_ID} Video={FakeVideo} />
    </ApiProvider>,
  );
}

describe('MatchScreen', () => {
  afterEach(async () => {
    calls.length = 0;
    await cleanup();
    await act(() => i18n.changeLanguage('es-AR'));
  });

  it('shows the score and plays the full video from a signed link', async () => {
    await renderMatch();
    expect(await screen.findByText('6-4 3-6 7-5')).toBeTruthy();
    expect(screen.getByText(new RegExp(m.score.won))).toBeTruthy();
    const video = await screen.findByTestId('fake-video');
    expect(video).toHaveTextContent(/^https:\/\/.*\|0$/);
    expect(calls.some((c) => c.endsWith('/media/0192af6e-7c1a-7d4e-9b3a-2f6c8e1d4a51/url'))).toBe(
      true,
    );
  });

  it('filters won and lost points and jumps to the point clip', async () => {
    await renderMatch();
    await screen.findByTestId('match-point-12');
    expect(screen.getByTestId('match-point-31')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('match-filter-lost'));
    expect(screen.queryByTestId('match-point-12')).toBeNull();
    await fireEvent.press(screen.getByTestId('match-point-31'));
    expect(await screen.findByTestId('match-back-to-full')).toBeTruthy();
    expect(calls.some((c) => c.endsWith('/media/0192af6e-7c1a-7d4e-9b3a-2f6c8e1d4b21/url'))).toBe(
      true,
    );
  });

  it('seeks the full video to a clip start', async () => {
    await renderMatch();
    await fireEvent.press(await screen.findByTestId('match-clip-0'));
    expect(await screen.findByTestId('fake-video')).toHaveTextContent(/\|600000$/);
  });

  it('labels stats as approximate while points are under review', async () => {
    const match = mockMatch();
    match.players[0] = {
      ...match.players[0],
      stats: {
        formula_version: '1.0.0',
        points_won: 40,
        winners: 9,
        forced_errors: 3,
        unforced_errors: 7,
        net_time_pct: 30,
        net_approaches: 5,
        distance_m: 1200,
        serve_points_won_pct: null,
        first_serve_in_pct: null,
        max_ball_speed_kmh: null,
        shots_by_type: [],
        lost_points_by_zone: [],
      },
    } as (typeof match.players)[number];
    await renderMatch(match);
    expect(await screen.findByTestId('match-stats-approx')).toBeTruthy();
    await cleanup();
    await renderMatch({ ...match, points_to_review: [] });
    await screen.findByTestId('match-stats');
    expect(screen.queryByTestId('match-stats-approx')).toBeNull();
  });

  it('shows a note when the download is still preparing', async () => {
    await renderMatch();
    await fireEvent.press(await screen.findByTestId('match-download'));
    // The mock answers `preparing` (full video still in the club): no URL, a note instead.
    expect(await screen.findByTestId('match-download-note')).toHaveTextContent(
      m.download.preparing,
    );
  });

  it('shows the video-unavailable state without a full video', async () => {
    await renderMatch(mockMatch({ full_video: null }));
    expect(await screen.findByText(m.video.unavailable)).toBeTruthy();
    expect(screen.queryByTestId('match-download')).toBeNull();
  });
});

describe('claim player', () => {
  const unclaimed = () => {
    const match = mockMatch();
    match.players = match.players.map((p) =>
      p.position <= 2 ? p : { ...p, user: null, confirmed: false, suggested: p.position === 3 },
    );
    return match;
  };
  const uid = '0192af6e-7c1a-7d4e-9b3a-2f6c8e1d4b99';

  afterEach(async () => {
    await cleanup();
  });

  it('lets the user claim a place and narrows the options', async () => {
    const match = unclaimed();
    match.players = match.players.map((p) =>
      p.position === 1 ? { ...p, user: { id: uid, display_name: 'X', photo_url: null } } : p,
    );
    await renderMatch(match);
    expect(await screen.findByTestId('match-claim-suggested-3')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('match-claim-3'));
    // Once claimed, the user holds a place and the step goes away.
    await waitFor(() => expect(screen.queryByTestId('match-claim')).toBeNull());
    expect(calls).toContain('POST /v1/matches/' + MOCK_MATCH_ID + '/claim-player');
  });

  it('is offered only to a user without a place', () => {
    const match = unclaimed();
    expect(canClaim(match, 'someone')).toBe(true);
    expect(canClaim(match, match.players.find((p) => p.position === 1)?.user?.id ?? null)).toBe(
      false,
    );
    expect(canClaim(mockMatch(), 'someone')).toBe(false);
    expect(canClaim({ ...match, status: 'processing' }, 'someone')).toBe(false);
  });
});

describe('match helpers', () => {
  it('filters points by the team that won them', () => {
    const pts = mockMatch().points_to_review;
    expect(filterPoints(pts, 1, 'won').map((p) => p.number)).toEqual([12]);
    expect(filterPoints(pts, 2, 'won').map((p) => p.number)).toEqual([31]);
    expect(filterPoints(pts, 1, 'all')).toHaveLength(2);
    expect(statsAreApproximate(mockMatch({ points_to_review: [] }))).toBe(false);
  });
});
