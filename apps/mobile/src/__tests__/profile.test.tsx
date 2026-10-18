import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { brand } from '@app/config/brand';

import { createMockAuthServer, type MockAuthServer } from '../auth/mock-api';
import { SessionProvider, useSession } from '../auth/session';
import { secureTokenStore } from '../auth/token-store';
import { i18n } from '../i18n';
import esAR from '../i18n/locales/es-AR.json';
import { ProfileScreen } from '../profile/ProfileScreen';
import { formatDeletionDate, validateProfile } from '../profile/profile-form';

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

const p = esAR.profile;

function Status() {
  const { status } = useSession();
  return <Text testID="status">{status}</Text>;
}

async function renderProfile(server: MockAuthServer = createMockAuthServer()) {
  await secureTokenStore.save(server.issueTokens());
  await render(
    <SessionProvider fetch={server.fetch} providers={null}>
      <Status />
      <ProfileScreen />
    </SessionProvider>,
  );
  await screen.findByTestId('profile-screen');
  return server;
}

const patches = (server: MockAuthServer) =>
  server.requests.filter((r) => r.path === '/me' && r.method === 'PATCH');

describe('ProfileScreen', () => {
  beforeEach(async () => {
    await secureTokenStore.clear();
  });

  afterEach(async () => {
    await cleanup();
    await act(() => i18n.changeLanguage('es-AR'));
  });

  it('loads the profile with GET /me', async () => {
    const server = await renderProfile();
    expect(screen.getByTestId('profile-name').props.value).toBe('Sofía Pérez');
    expect(screen.getByText(p.category.options['8'])).toBeTruthy();
    expect(screen.getByText(p.category.options['1'])).toBeTruthy();
    expect(screen.getByTestId('profile-photo')).toBeTruthy();
    expect(server.requests.some((r) => r.path === '/me' && r.method === 'GET')).toBe(true);
  });

  it('edits and saves category, hand and side with PATCH /me', async () => {
    const server = await renderProfile();
    await fireEvent.changeText(screen.getByTestId('profile-name'), '  Sofi Pérez ');
    await fireEvent.press(screen.getByTestId('profile-category-6'));
    await fireEvent.press(screen.getByTestId('profile-hand-left'));
    await fireEvent.press(screen.getByTestId('profile-side-reves'));
    expect(screen.getByTestId('profile-side-reves').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByTestId('profile-save'));

    expect(await screen.findByText(p.saved)).toBeTruthy();
    expect(patches(server)[0]?.body).toEqual({
      display_name: 'Sofi Pérez',
      declared_category: '6',
      dominant_hand: 'left',
      playing_side: 'reves',
      training_opt_out: false,
    });
    expect(screen.getByTestId('profile-name').props.value).toBe('Sofi Pérez');
  });

  it('saves the training opt-out', async () => {
    const server = await renderProfile();
    await fireEvent(screen.getByTestId('profile-training-opt-out'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('profile-save'));
    await screen.findByText(p.saved);
    expect(patches(server)[0]?.body).toMatchObject({ training_opt_out: true });
    expect(screen.getByTestId('profile-training-opt-out').props.value).toBe(true);
  });

  it('validates the name before calling the API', async () => {
    const server = await renderProfile();
    await fireEvent.changeText(screen.getByTestId('profile-name'), '   ');
    await fireEvent.press(screen.getByTestId('profile-save'));
    expect(screen.getByText(p.errors.nameRequired)).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('profile-name'), 'a'.repeat(81));
    await fireEvent.press(screen.getByTestId('profile-save'));
    expect(screen.getByText(p.errors.nameTooLong)).toBeTruthy();
    expect(patches(server)).toHaveLength(0);
  });

  it('shows the contract error when saving fails', async () => {
    const server = await renderProfile();
    server.failNext('/me', 429, 'RATE_LIMITED');
    await fireEvent.press(screen.getByTestId('profile-save'));
    expect(await screen.findByText(p.errors.RATE_LIMITED)).toBeTruthy();
    expect(screen.queryByText(p.saved)).toBeNull();
  });

  it('maps a VALIDATION_FAILED answer and unknown codes', async () => {
    const server = await renderProfile();
    server.failNext('/me', 400, 'VALIDATION_FAILED');
    await fireEvent.press(screen.getByTestId('profile-save'));
    expect(await screen.findByText(p.errors.VALIDATION_FAILED)).toBeTruthy();

    server.failNext('/me', 500, 'INTERNAL_ERROR');
    await fireEvent.press(screen.getByTestId('profile-save'));
    expect(await screen.findByText(p.errors.generic)).toBeTruthy();
  });

  it('deletes the account only after confirming and shows the deletion date', async () => {
    const server = await renderProfile();
    await fireEvent.press(screen.getByTestId('profile-delete'));
    expect(screen.getByText(p.delete.confirmTitle)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('profile-delete-cancel'));
    expect(screen.queryByTestId('profile-delete-confirm')).toBeNull();
    expect(server.requests.some((r) => r.method === 'DELETE')).toBe(false);

    await fireEvent.press(screen.getByTestId('profile-delete'));
    await fireEvent.press(screen.getByTestId('profile-delete-confirm-button'));
    await screen.findByTestId('profile-deleted');
    const deletion = server.requests.filter((r) => r.method === 'DELETE');
    expect(deletion).toHaveLength(1);

    const expected = formatDeletionDate(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    );
    expect(screen.getByText(p.delete.doneBody.replace('{date}', expected))).toBeTruthy();

    await fireEvent.press(screen.getByTestId('profile-deleted-exit'));
    expect(screen.getByTestId('status').props.children).toBe('signedOut');
  });

  it('shows an error when deleting fails and keeps the account', async () => {
    const server = await renderProfile();
    server.failNext('/me', 429, 'RATE_LIMITED');
    await fireEvent.press(screen.getByTestId('profile-delete'));
    await fireEvent.press(screen.getByTestId('profile-delete-confirm-button'));
    expect(await screen.findByTestId('profile-delete-error')).toBeTruthy();
    expect(screen.queryByTestId('profile-deleted')).toBeNull();
  });

  it('takes every text from i18n, none hardcoded', async () => {
    const keys = JSON.parse(
      JSON.stringify(esAR.profile, (_k, v: unknown) => (typeof v === 'string' ? `x-${v}` : v)),
    ) as typeof esAR.profile;
    i18n.addResourceBundle('xx', 'translation', { profile: keys });
    await act(() => i18n.changeLanguage('xx'));
    await renderProfile();
    expect(screen.getByText(`x-${p.title}`)).toBeTruthy();
    expect(screen.getByText(`x-${p.side.options.reves}`)).toBeTruthy();
    expect(screen.getByText(`x-${p.trainingOptOut.label}`)).toBeTruthy();
    expect(screen.getByText(`x-${p.save}`)).toBeTruthy();
    expect(screen.getByText(`x-${p.delete.entry}`)).toBeTruthy();
    expect(screen.queryByText(p.title)).toBeNull();
    expect(screen.queryByText(p.save)).toBeNull();
  });

  it('never writes the brand name by hand in the profile texts', () => {
    expect(JSON.stringify(p).toLowerCase()).not.toContain(brand.name.toLowerCase());
  });
});

describe('validateProfile', () => {
  const base = {
    display_name: 'Sofía',
    declared_category: null,
    dominant_hand: null,
    playing_side: null,
    training_opt_out: false,
  };

  it('accepts a valid profile and trims the name', () => {
    expect(validateProfile({ ...base, display_name: ' Sofía ' })).toEqual({
      ok: true,
      body: { ...base, display_name: 'Sofía' },
    });
  });

  it('rejects categories outside 8va to 1ra', () => {
    const result = validateProfile({ ...base, declared_category: '9' as '8' });
    expect(result.ok).toBe(false);
  });
});
