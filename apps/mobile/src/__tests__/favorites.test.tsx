import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { useState } from 'react';

import { createMockAuthServer, type MockAuthServer } from '../auth/mock-api';
import { SessionProvider } from '../auth/session';
import { secureTokenStore } from '../auth/token-store';
import { FindSlotScreen } from '../booking/FindSlotScreen';
import { clubInitials, moveItem } from '../favorites/favorites-data';
import { HomeScreen } from '../home/HomeScreen';
import { i18n } from '../i18n';
import esAR from '../i18n/locales/es-AR.json';

jest.mock('expo-secure-store', () => {
  const items = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
    getItemAsync: jest.fn(async (k: string) => items.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      items.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      items.delete(k);
    }),
  };
});

const f = esAR.favorites;
const PALERMO = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60';
const QUILMES = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a90';
// 2026-10-23 06:00 in Buenos Aires: the whole day is still ahead.
const NOW = new Date('2026-10-23T09:00:00Z');

/** The booking flow and the home in one app, like the tabs of the real one. */
function App({ start = 'home', clubId }: { start?: 'home' | 'book'; clubId?: string }) {
  const [screen, setScreen] = useState(start);
  return screen === 'home' ? (
    <HomeScreen onFindClubs={() => setScreen('book')} onBookAgain={() => setScreen('book')} />
  ) : (
    <FindSlotScreen now={() => NOW} initialClubId={clubId} onBooked={() => setScreen('home')} />
  );
}

async function renderApp(server: MockAuthServer, props: Parameters<typeof App>[0] = {}) {
  await secureTokenStore.save(server.issueTokens());
  await render(
    <SessionProvider fetch={server.fetch} providers={null}>
      <App {...props} />
    </SessionProvider>,
  );
}

async function bookFirstSlot(clubId: string) {
  await fireEvent.press(await screen.findByTestId('view-list'));
  await fireEvent.press(await screen.findByTestId(`club-${clubId}`));
  await fireEvent.press(await screen.findByTestId('slot-first'));
  await fireEvent.press(await screen.findByTestId('book-slot'));
}

describe('favorite clubs', () => {
  beforeEach(async () => {
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'performance',
        'hrtime',
      ],
    });
    await secureTokenStore.clear();
    await act(() => i18n.changeLanguage('es-AR'));
  });

  afterEach(async () => {
    await cleanup();
    jest.useRealTimers();
  });

  it('shows the empty state with the invitation to star clubs', async () => {
    await renderApp(createMockAuthServer({ now: () => NOW }));
    expect(await screen.findByText(f.empty.title)).toBeTruthy();
    expect(screen.getByText(f.empty.body)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('favorites-find'));
    expect(await screen.findByTestId('find-slot-screen')).toBeTruthy();
  });

  it('star a club, book it and see the booking under that club at once', async () => {
    const server = createMockAuthServer({ now: () => NOW });
    await renderApp(server, { start: 'book' });

    await fireEvent.press(await screen.findByTestId('view-list'));
    await fireEvent.press(await screen.findByTestId(`favorite-star-${PALERMO}`));
    await waitFor(() => expect(screen.getByTestId(`favorite-star-${PALERMO}`)).toBeSelected());
    await fireEvent.press(await screen.findByTestId(`club-${PALERMO}`));
    await fireEvent.press(await screen.findByTestId('slot-first'));
    await fireEvent.press(await screen.findByTestId('book-slot'));

    const card = await screen.findByTestId(`favorite-${PALERMO}`);
    expect(within(card).getByText('Club Demo Palermo')).toBeTruthy();
    expect(within(card).getByText(f.booking.new)).toBeTruthy();
    expect(within(card).getByText(/Cancha 1/)).toBeTruthy();
    expect(screen.getByText(f.booked.title)).toBeTruthy();
    // Already a favorite: no question.
    expect(screen.queryByTestId('favorite-prompt')).toBeNull();
    expect(
      server.requests.some((r) => r.method === 'PUT' && r.path === `/me/favorite-clubs/${PALERMO}`),
    ).toBe(true);
  });

  it('a booking in a club that is not a favorite asks to mark it, and "sí" stars it', async () => {
    await renderApp(createMockAuthServer({ now: () => NOW }), { start: 'book' });
    await bookFirstSlot(QUILMES);

    expect(await screen.findByTestId('just-booked')).toBeTruthy();
    expect(screen.getByText(f.prompt.title.replace('{club}', 'Club Demo Quilmes'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('favorite-prompt-yes'));

    const card = await screen.findByTestId(`favorite-${QUILMES}`);
    expect(within(card).getByText('Club Demo Quilmes')).toBeTruthy();
    expect(screen.queryByTestId('favorite-prompt')).toBeNull();
  });

  it('"ahora no" keeps the booking visible and does not star the club', async () => {
    await renderApp(createMockAuthServer({ now: () => NOW }), { start: 'book' });
    await bookFirstSlot(PALERMO);
    await fireEvent.press(await screen.findByTestId('favorite-prompt-no'));
    await waitFor(() => expect(screen.queryByTestId('favorite-prompt')).toBeNull());
    expect(screen.queryByTestId(`favorite-${PALERMO}`)).toBeNull();
  });

  it('cancels a booking from the home', async () => {
    await renderApp(createMockAuthServer({ now: () => NOW }), { start: 'book' });
    await fireEvent.press(await screen.findByTestId('view-list'));
    await fireEvent.press(await screen.findByTestId(`favorite-star-${PALERMO}`));
    await fireEvent.press(await screen.findByTestId(`club-${PALERMO}`));
    await fireEvent.press(await screen.findByTestId('slot-first'));
    await fireEvent.press(await screen.findByTestId('book-slot'));
    const card = await screen.findByTestId(`favorite-${PALERMO}`);
    const cancel = await within(card).findByText(f.booking.cancel);
    await fireEvent.press(cancel);
    expect(await screen.findByTestId(`favorite-no-bookings-${PALERMO}`)).toBeTruthy();
  });

  it('edits the favorites: reorders and removes', async () => {
    const server = createMockAuthServer({ now: () => NOW });
    await renderApp(server, { start: 'book' });
    await fireEvent.press(await screen.findByTestId('view-list'));
    await fireEvent.press(await screen.findByTestId(`favorite-star-${PALERMO}`));
    await waitFor(() => expect(screen.getByTestId(`favorite-star-${PALERMO}`)).toBeSelected());
    await fireEvent.press(screen.getByTestId(`favorite-star-${QUILMES}`));
    await waitFor(() => expect(screen.getByTestId(`favorite-star-${QUILMES}`)).toBeSelected());
    // Back to the home through a booking is long; mount the home directly instead.
    await cleanup();
    await render(
      <SessionProvider fetch={server.fetch} providers={null}>
        <HomeScreen />
      </SessionProvider>,
    );
    await fireEvent.press(await screen.findByTestId('favorites-edit'));
    expect(await screen.findByTestId('edit-favorites')).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`down-${PALERMO}`));
    await waitFor(() => {
      const put = server.requests.filter(
        (r) => r.method === 'PUT' && r.path === '/me/favorite-clubs',
      );
      expect(put.at(-1)?.body).toEqual({ club_ids: [QUILMES, PALERMO] });
    });

    await fireEvent.press(screen.getByTestId(`remove-${QUILMES}`));
    await waitFor(() => expect(screen.queryByTestId(`edit-${QUILMES}`)).toBeNull());
    await fireEvent.press(screen.getByTestId('favorites-done'));
    expect(await screen.findByTestId(`favorite-${PALERMO}`)).toBeTruthy();
  });
});

describe('favorites helpers', () => {
  it('builds the initials of a club', () => {
    expect(clubInitials('Club Demo Palermo')).toBe('CD');
    expect(clubInitials('Padel')).toBe('P');
  });

  it('moves an item one place and stays put at the edges', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});
