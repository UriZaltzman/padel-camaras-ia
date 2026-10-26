import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createMockAuthServer, type MockAuthServer } from '../auth/mock-api';
import { SessionProvider } from '../auth/session';
import { secureTokenStore } from '../auth/token-store';
import { FindSlotScreen, type SelectedSlot } from '../booking/FindSlotScreen';
import {
  PLAYER_HORIZON_DAYS,
  bookableDates,
  errorKey,
  BookingApiError,
  formatPrice,
  formatTime,
} from '../booking/find-slot';
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

const f = esAR.findSlot;
const PALERMO = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60';
const COURT_1 = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a61';
const MAINTENANCE = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a63';
// 2026-10-23 06:00 in Buenos Aires: before opening, so the whole day is free.
const NOW = new Date('2026-10-23T09:00:00Z');

async function renderFind(
  server: MockAuthServer = createMockAuthServer({ now: () => NOW }),
  onSelectSlot?: (s: SelectedSlot) => void,
) {
  await secureTokenStore.save(server.issueTokens());
  await render(
    <SessionProvider fetch={server.fetch} providers={null}>
      <FindSlotScreen now={() => NOW} onSelectSlot={onSelectSlot} />
    </SessionProvider>,
  );
  await screen.findByTestId('club-explorer');
  await fireEvent.press(await screen.findByTestId('view-list'));
  await screen.findByTestId('club-list');
  return server;
}

const availabilityCalls = (server: MockAuthServer) =>
  server.requests.filter((r) => r.path.endsWith('/availability'));

describe('FindSlotScreen', () => {
  beforeEach(async () => {
    // The availability mock drops slots in the past with the real clock: freeze only `Date`.
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
  });

  afterEach(async () => {
    await cleanup();
    jest.useRealTimers();
  });

  it('lists clubs and filters them by name or city', async () => {
    await renderFind();
    expect(screen.getByText('Club Demo Palermo')).toBeTruthy();
    expect(screen.getByText('Club Demo Quilmes')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('club-search'), 'quilmes');
    await screen.findByText('Club Demo Quilmes');
    expect(await screen.findByTestId('club-list')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Club Demo Palermo')).toBeNull());

    await fireEvent.changeText(screen.getByTestId('club-search'), 'rosario');
    expect(await screen.findByTestId('club-empty')).toBeTruthy();
  });

  it('picks a free slot of an active court and reports it', async () => {
    const onSelect = jest.fn();
    const server = await renderFind(undefined, onSelect);
    await fireEvent.press(screen.getByTestId(`club-${PALERMO}`));
    await screen.findByTestId('slot-first');

    // Only active courts are asked for availability, with the default 90 minutes.
    const calls = availabilityCalls(server);
    expect(calls.some((c) => c.path.includes(MAINTENANCE))).toBe(false);
    expect(screen.queryByTestId(`court-${MAINTENANCE}`)).toBeNull();

    await fireEvent.press(screen.getByTestId('duration-60'));
    await screen.findByTestId('slot-first');
    await fireEvent.press(screen.getByTestId('slot-first'));

    expect(screen.getByTestId('slot-selected')).toBeTruthy();
    const picked = onSelect.mock.calls[0]?.[0] as SelectedSlot;
    expect(picked.court.id).toBe(COURT_1);
    expect(picked.durationMinutes).toBe(60);
    expect(formatTime(picked.slot.starts_at)).toBe('08:30');
    expect(screen.getByText(/08:30 · 60 min/)).toBeTruthy();
  });

  it('only offers days within the player horizon', async () => {
    await renderFind();
    await fireEvent.press(screen.getByTestId(`club-${PALERMO}`));
    await screen.findByTestId('slot-first');
    expect(screen.getByTestId('date-2026-10-23')).toBeTruthy();
    expect(screen.getByTestId('date-2026-11-06')).toBeTruthy();
    expect(screen.queryByTestId('date-2026-11-07')).toBeNull();
  });

  it('shows the contract error when availability fails', async () => {
    const server = createMockAuthServer({ now: () => NOW });
    await renderFind(server);
    server.failNext(`/courts/${COURT_1}/availability`, 429, 'RATE_LIMITED');
    await fireEvent.press(screen.getByTestId(`club-${PALERMO}`));
    expect(await screen.findByText(f.errors.RATE_LIMITED)).toBeTruthy();
  });

  it('goes back to the club search', async () => {
    await renderFind();
    await fireEvent.press(screen.getByTestId(`club-${PALERMO}`));
    await screen.findByTestId('club-slots-screen');
    await fireEvent.press(screen.getByTestId('club-back'));
    expect(await screen.findByTestId('find-slot-screen')).toBeTruthy();
  });

  it('takes its texts from i18n', async () => {
    await act(() => i18n.changeLanguage('es-AR'));
    await renderFind();
    expect(screen.getByText(f.title)).toBeTruthy();
  });
});

describe('find-slot helpers', () => {
  it('offers today plus 14 days and never more', () => {
    const dates = bookableDates(NOW);
    expect(dates).toHaveLength(PLAYER_HORIZON_DAYS + 1);
    expect(dates[0]).toBe('2026-10-23');
    expect(dates.at(-1)).toBe('2026-11-06');
    expect(bookableDates(NOW, 30)).toHaveLength(15);
    expect(bookableDates(NOW, 3)).toHaveLength(4);
  });

  it('uses the Buenos Aires day, not the UTC one', () => {
    // 01:00 UTC on the 24th is still the 23rd in Buenos Aires.
    expect(bookableDates(new Date('2026-10-24T01:00:00Z'))[0]).toBe('2026-10-23');
  });

  it('formats prices from cents without decimals', () => {
    expect(formatPrice(2400000)).toMatch(/24\.000/);
  });

  it('maps API errors to i18n keys', () => {
    expect(errorKey(new BookingApiError('RATE_LIMITED'))).toBe('findSlot.errors.RATE_LIMITED');
    expect(errorKey(new BookingApiError('INTERNAL_ERROR'))).toBe('findSlot.errors.generic');
    expect(errorKey(new TypeError('offline'))).toBe('findSlot.errors.network');
  });
});
