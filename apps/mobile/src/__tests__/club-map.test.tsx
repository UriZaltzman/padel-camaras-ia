import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';

import { createMockAuthServer } from '../auth/mock-api';
import { SessionProvider } from '../auth/session';
import { secureTokenStore } from '../auth/token-store';
import { FindSlotScreen } from '../booking/FindSlotScreen';
import { hasSlotInHour, localHour } from '../booking/hours';
import { clubPosition } from '../booking/localities';
import { clusterPins, DEFAULT_VIEWPORT, fitViewport } from '../booking/map-cluster';
import { mapProvider } from '../booking/map-config';
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

const PALERMO = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60';
const QUILMES = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a90';
// 2026-10-23 06:00 in Buenos Aires.
const NOW = new Date('2026-10-23T09:00:00Z');
const TODAY = '2026-10-23';

async function renderFind() {
  const server = createMockAuthServer();
  await secureTokenStore.save(server.issueTokens());
  await render(
    <SessionProvider fetch={server.fetch} providers={null}>
      <FindSlotScreen now={() => NOW} />
    </SessionProvider>,
  );
  await screen.findByTestId('club-explorer');
}

describe('club map', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es-AR');
    await secureTokenStore.clear();
  });
  afterEach(async () => {
    await cleanup();
  });

  it('shows a pin per club and opens the club when a pin is pressed', async () => {
    await renderFind();
    await screen.findByTestId('club-map');
    expect(screen.getByTestId(`pin-${PALERMO}`)).toBeTruthy();
    expect(screen.getByTestId(`pin-${QUILMES}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`pin-${QUILMES}`));
    expect(await screen.findByTestId('club-slots-screen')).toBeTruthy();
  });

  it('shows only clubs with a free start at the picked day and hour', async () => {
    await renderFind();
    await fireEvent.press(screen.getByTestId(`filter-date-${TODAY}`));
    await fireEvent.press(screen.getByTestId('hour-20'));
    await screen.findByTestId(`pin-${PALERMO}`);
    expect(screen.queryByTestId(`pin-${QUILMES}`)).toBeNull();
    // The list shows the same clubs.
    await fireEvent.press(screen.getByTestId('view-list'));
    expect(await screen.findByTestId(`club-${PALERMO}`)).toBeTruthy();
    expect(screen.queryByTestId(`club-${QUILMES}`)).toBeNull();
  });

  it('shows the empty state when no club has a free slot', async () => {
    await renderFind();
    await fireEvent.press(screen.getByTestId('locality-quilmes'));
    await fireEvent.press(screen.getByTestId('hour-20'));
    const empty = await screen.findByTestId('club-empty-zone');
    expect(empty.props.children).toBe(esAR.findSlot.emptyZone);
    expect(esAR.findSlot.emptyZone).toBe(
      'No hay canchas libres en esa zona y horario. Probá otra hora.',
    );
  });

  it('only offers days inside the 14-day player horizon', async () => {
    await renderFind();
    expect(screen.getByTestId('filter-date-2026-11-06')).toBeTruthy();
    expect(screen.queryByTestId('filter-date-2026-11-07')).toBeNull();
  });

  it('filters by locality', async () => {
    await renderFind();
    await fireEvent.press(screen.getByTestId('locality-quilmes'));
    expect(screen.getByTestId(`pin-${QUILMES}`)).toBeTruthy();
    expect(screen.queryByTestId(`pin-${PALERMO}`)).toBeNull();
  });
});

describe('map helpers', () => {
  it('places clubs by locality and leaves unknown cities out', () => {
    expect(clubPosition({ id: 'a', city: 'CABA' })).not.toBeNull();
    expect(clubPosition({ id: 'a', city: 'Quílmes' })).not.toBeNull();
    expect(clubPosition({ id: 'a', city: 'Narnia' })).toBeNull();
  });

  it('merges close pins into a cluster and zooms in to separate them', () => {
    const near = [
      { item: { id: 'a' }, pos: { lat: -34.6, lng: -58.4 } },
      { item: { id: 'b' }, pos: { lat: -34.601, lng: -58.401 } },
      { item: { id: 'c' }, pos: { lat: -34.75, lng: -58.25 } },
    ];
    const clusters = clusterPins(near, DEFAULT_VIEWPORT, 320, 360);
    expect(clusters.map((c) => c.members.length).sort()).toEqual([1, 2]);
    const zoomed = fitViewport(
      near.slice(0, 2).map((p) => p.pos),
      DEFAULT_VIEWPORT,
    );
    expect(clusterPins(near.slice(0, 2), zoomed, 320, 360)).toHaveLength(2);
  });

  it('reads the local hour of a slot', () => {
    expect(localHour('2026-10-23T23:00:00Z')).toBe(20);
    const slots = [{ starts_at: '2026-10-23T23:30:00Z' }] as never;
    expect(hasSlotInHour(slots, 20)).toBe(true);
    expect(hasSlotInHour(slots, 21)).toBe(false);
  });

  it('keeps the map provider behind config and falls back to the built-in map', () => {
    expect(mapProvider({})).toBe('schematic');
    expect(mapProvider({ EXPO_PUBLIC_MAP_PROVIDER: 'native' })).toBe('schematic');
    expect(() => mapProvider({ EXPO_PUBLIC_MAP_PROVIDER: 'bogus' })).toThrow();
  });
});
