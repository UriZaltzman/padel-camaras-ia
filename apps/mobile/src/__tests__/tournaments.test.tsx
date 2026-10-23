import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';

import { createApiClient } from '@app/contracts';

import type { Fetch } from '../auth/authed-fetch';
import { ApiProvider } from '../api/client';
import { i18n } from '../i18n';
import {
  MOCK_CLUB_ID,
  MOCK_ME_ID,
  createMockPartnerFinder,
  mockOpenTournament,
  mockPartners,
  mockRunningTournament,
  withTournamentsMock,
} from '../tournaments/mock-tournaments';
import { groupLetter, myPair, nextMatch } from '../tournaments/tournament-data';
import { mockRunningDetail } from '../tournaments/mock-tournaments';
import { TournamentDetailScreen, TournamentsScreen } from '../tournaments/TournamentsScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../auth/session', () => ({ useSession: () => ({ user: { id: MOCK_ME_ID } }) }));

const disabled = () =>
  Promise.resolve(
    new Response(JSON.stringify({ code: 'CLUB_FEATURE_DISABLED', message: 'x' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

async function renderUi(
  ui: React.ReactElement,
  fetch = withTournamentsMock(() => Promise.reject()),
) {
  const client = createApiClient({ baseUrl: 'http://test/v1', fetch });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ApiProvider client={client} queryClient={queryClient}>
      {ui}
    </ApiProvider>,
  );
}

beforeAll(() => i18n.changeLanguage('es-AR'));

describe('tournament helpers', () => {
  it('finds my pair and my next match', () => {
    const detail = mockRunningDetail();
    const pair = myPair(detail, MOCK_ME_ID);
    if (!pair) throw new Error('mock user has no pair');
    expect(nextMatch(detail, pair.id)?.status).toBe('scheduled');
    expect(groupLetter(1)).toBe('B');
  });
});

describe('tournaments app', () => {
  it('lists the tournaments and opens one', async () => {
    await renderUi(<TournamentsScreen clubId={MOCK_CLUB_ID} />);
    await fireEvent.press(await screen.findByTestId(`tournament-${mockOpenTournament.id}`));
    expect(mockPush).toHaveBeenCalledWith(`/tournaments/${MOCK_CLUB_ID}/${mockOpenTournament.id}`);
  });

  it('shows the disabled state when the club has the module off', async () => {
    await renderUi(<TournamentsScreen clubId={MOCK_CLUB_ID} />, disabled);
    expect(await screen.findByTestId('tournaments-disabled')).toBeTruthy();
  });

  it('registers with a partner and shows the pay-at-club note after', async () => {
    const posts: unknown[] = [];
    const base = withTournamentsMock(() => Promise.reject(new Error('unexpected')));
    const spy: Fetch = async (input) => {
      if (input.method === 'POST') posts.push(await input.clone().json());
      return base(input);
    };
    await renderUi(
      <TournamentDetailScreen
        clubId={MOCK_CLUB_ID}
        tournamentId={mockOpenTournament.id}
        finder={createMockPartnerFinder()}
      />,
      spy,
    );
    const partner = mockPartners[0] ?? fail('no mock partner');
    await fireEvent.changeText(await screen.findByTestId('tournament-partner-input'), 'mart');
    await fireEvent.press(await screen.findByTestId(`partner-${partner.user_id}`));
    await fireEvent.press(screen.getByTestId('tournament-register-submit'));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ partner_user_id: partner.user_id });
  });

  it('shows without a finder that registration is unavailable', async () => {
    await renderUi(
      <TournamentDetailScreen clubId={MOCK_CLUB_ID} tournamentId={mockOpenTournament.id} />,
    );
    expect(await screen.findByTestId('tournament-register-unavailable')).toBeTruthy();
  });

  it('shows my next match, the standings and the fixture', async () => {
    await renderUi(
      <TournamentDetailScreen clubId={MOCK_CLUB_ID} tournamentId={mockRunningTournament.id} />,
    );
    expect(await screen.findByTestId('tournament-next-match')).toBeTruthy();
    expect(screen.getByTestId('tournament-standings')).toBeTruthy();
    expect(screen.getByTestId('tournament-fixture')).toBeTruthy();
  });
});
