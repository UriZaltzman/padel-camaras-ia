import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';

import { createApiClient } from '@app/contracts';

import { ApiProvider } from '../api/client';
import { CourtJoinScreen } from '../court/CourtJoinScreen';
import { isTaken, joinOffer, needsPayment, spotPosition } from '../court/court-join';
import { createMockCourtService, mockCourtSession, MOCK_COURT_ID } from '../court/mock-court';
import { i18n } from '../i18n';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
let mockUser: { id: string } | null = { id: 'u1' };
jest.mock('../auth/session', () => ({ useSession: () => ({ user: mockUser }) }));

async function renderScreen(service = createMockCourtService()) {
  const client = createApiClient({ baseUrl: 'http://test/v1', fetch: () => Promise.reject() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ApiProvider client={client} queryClient={queryClient}>
      <CourtJoinScreen courtId={MOCK_COURT_ID} service={service} />
    </ApiProvider>,
  );
  return service;
}

beforeAll(() => i18n.changeLanguage('es-AR'));
beforeEach(() => {
  mockReplace.mockClear();
  mockUser = { id: 'u1' };
});

describe('court QR logic', () => {
  it('maps spots to positions and taken spots', () => {
    expect(spotPosition({ team: 2, side: 'reves' })).toBe(4);
    expect(isTaken(mockCourtSession(), { team: 1, side: 'drive' })).toBe(true);
  });
  it('offers by club mode and booking', () => {
    expect(joinOffer(mockCourtSession({ ai_video: 'off' })).kind).toBe('off');
    expect(joinOffer(mockCourtSession()).kind).toBe('join');
    expect(joinOffer(mockCourtSession({ booking: null })).kind).toBe('none');
    expect(joinOffer(mockCourtSession({ booking: null, free_session_allowed: true })).kind).toBe(
      'free_session',
    );
  });
  it('gates payment only when the player pays and has no access', () => {
    const base = { ai_video: 'player_pays' as const, extra_amount_cents: 150000 };
    expect(needsPayment(mockCourtSession({ ...base, player_has_access: false }))).toBe(true);
    expect(needsPayment(mockCourtSession({ ...base, player_has_access: true }))).toBe(false);
    expect(needsPayment(mockCourtSession())).toBe(false);
  });
});

describe('CourtJoinScreen', () => {
  it('joins the match and opens it', async () => {
    const service = await renderScreen();
    await screen.findByText('Sumarte al partido de las 19:30');
    await fireEvent.press(screen.getByTestId('court-spot-1')); // taken: ignored
    await fireEvent.press(screen.getByTestId('court-spot-3'));
    await fireEvent.press(screen.getByTestId('court-join'));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/match/01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b'),
    );
    expect(service.joined).toEqual([3]);
  });
  it('shows the payment gate instead of joining when the player pays', async () => {
    await renderScreen(
      createMockCourtService(
        mockCourtSession({
          ai_video: 'player_pays',
          extra_amount_cents: 150000,
          player_has_access: false,
        }),
      ),
    );
    await screen.findByTestId('court-gate');
    expect(screen.queryByTestId('court-join')).toBeNull();
  });
  it('tells guests they can claim later', async () => {
    mockUser = null;
    await renderScreen();
    expect(await screen.findByTestId('court-guest')).toBeTruthy();
  });
  it('says so when Smart Court is off, and when there is no service', async () => {
    await renderScreen(createMockCourtService(mockCourtSession({ ai_video: 'off' })));
    expect(await screen.findByTestId('court-off')).toBeTruthy();
  });
});
