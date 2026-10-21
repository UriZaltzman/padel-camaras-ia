import { act, cleanup, render, screen } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';

import { brand } from '@app/config/brand';
import { createApiClient } from '@app/contracts';
import { color } from '@app/ui/tokens';

import { ApiProvider } from '../api/client';
import { formatSets, formatSlot } from '../home/home-data';
import { HomeScreen } from '../home/HomeScreen';
import { mockLastMatch, mockNextBooking, withHomeMock } from '../home/mock-home';
import { i18n } from '../i18n';
import esAR from '../i18n/locales/es-AR.json';

const h = esAR.home;
const notFound = () => Promise.resolve(new Response('{}', { status: 404 }));

async function renderHome(
  opts: { matches?: (typeof mockLastMatch)[]; booking?: boolean; fail?: boolean } = {},
) {
  const fetch = opts.fail
    ? () =>
        Promise.resolve(
          new Response(JSON.stringify({ code: 'INTERNAL', message: 'x' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
    : withHomeMock(notFound, opts.matches);
  const client = createApiClient({ baseUrl: 'http://test/v1', fetch });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const booking = mockNextBooking(Date.parse('2026-10-21T12:00:00Z'));
  await render(
    <ApiProvider client={client} queryClient={queryClient}>
      <HomeScreen
        loadNextBooking={opts.booking === false ? undefined : () => Promise.resolve(booking)}
      />
    </ApiProvider>,
  );
  return booking;
}

describe('HomeScreen', () => {
  afterEach(async () => {
    await cleanup();
    await act(() => i18n.changeLanguage('es-AR'));
  });

  it('shows the next booking and the last match from the mock', async () => {
    const booking = await renderHome();
    expect(await screen.findByText(formatSlot(booking.starts_at))).toBeTruthy();
    expect(screen.getByText('Pádel Norte · Cancha 2 · 90 min')).toBeTruthy();
    expect(await screen.findByText('6-4 3-6 7-5')).toBeTruthy();
    expect(screen.getByTestId('home-last-match-result')).toHaveTextContent(/Ganaste/);
    expect(screen.getByText(brand.name)).toBeTruthy();
  });

  it('shows empty states when there is no booking and no match', async () => {
    await renderHome({ matches: [], booking: false });
    expect(await screen.findByText(h.nextBooking.empty)).toBeTruthy();
    expect(await screen.findByText(h.lastMatch.empty)).toBeTruthy();
  });

  it('shows the error text when the API fails', async () => {
    await renderHome({ fail: true, booking: false });
    expect(await screen.findByText(h.error)).toBeTruthy();
  });

  it('takes every text from i18n, none hardcoded', async () => {
    i18n.addResourceBundle('xx', 'translation', {
      home: {
        dataLabel: 'k1',
        title: 'k2',
        loading: 'k3',
        error: 'k4',
        nextBooking: { label: 'k5', place: 'k6', empty: 'k7' },
        lastMatch: { label: 'k8', won: 'k9', lost: 'k10', place: 'k11', empty: 'k12' },
        primaryAction: 'k13',
      },
    });
    await act(() => i18n.changeLanguage('xx'));
    await renderHome({ matches: [], booking: false });
    for (const text of ['k1', 'k2', 'k5', 'k7', 'k8', 'k12', 'k13']) {
      expect(await screen.findByText(text)).toBeTruthy();
    }
  });

  it('uses Vidrio as background and Azul cancha for the primary action', async () => {
    await renderHome();
    const bg = StyleSheet.flatten(screen.getByTestId('home-screen').props.style);
    expect(bg.backgroundColor).toBe(color.glass);
    const button = StyleSheet.flatten(screen.getByTestId('home-primary-action').props.style);
    expect(button.backgroundColor).toBe(color.court);
    await screen.findByText('6-4 3-6 7-5');
  });

  it('never writes the brand name by hand in the es-AR texts', () => {
    expect(JSON.stringify(esAR).toLowerCase()).not.toContain(brand.name.toLowerCase());
  });
});

describe('home formatting', () => {
  it('formats the slot in Buenos Aires time', () => {
    expect(formatSlot('2026-10-15T22:00:00Z')).toMatch(/jueves,? 15 de octubre · 19:00/);
  });

  it('shows the sets from the user team side', () => {
    expect(formatSets(mockLastMatch.sets, 1)).toBe('6-4 3-6 7-5');
    expect(formatSets(mockLastMatch.sets, 2)).toBe('4-6 6-3 5-7');
  });
});
