import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';

import { createMockAuthServer, type MockAuthServer } from '../auth/mock-api';
import { SessionProvider } from '../auth/session';
import { secureTokenStore } from '../auth/token-store';
import type { PreferenceStore } from '../notifications/preferences';
import { reminderId, type NotificationsModule } from '../notifications/reminders';
import { SettingsScreen } from '../settings/SettingsScreen';

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

function fakeNotifications(granted: boolean) {
  const scheduled = new Set<string>([reminderId('b1')]);
  const n = {
    getPermissionsAsync: jest.fn(async () => ({ granted, canAskAgain: !granted })),
    requestPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: false })),
    scheduleNotificationAsync: jest.fn(),
    cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
      scheduled.delete(id);
    }),
    getAllScheduledNotificationsAsync: jest.fn(async () =>
      [...scheduled].map((identifier) => ({ identifier })),
    ),
  };
  return { n: n as unknown as NotificationsModule, scheduled };
}

function memoryPreferences(initial = true): PreferenceStore & { value: boolean } {
  return {
    value: initial,
    async remindersEnabled() {
      return this.value;
    },
    async setRemindersEnabled(enabled) {
      this.value = enabled;
    },
  };
}

async function renderSettings(
  opts: { granted?: boolean; reminders?: boolean; server?: MockAuthServer } = {},
) {
  const server = opts.server ?? createMockAuthServer();
  const notifications = fakeNotifications(opts.granted ?? true);
  const preferences = memoryPreferences(opts.reminders ?? true);
  await secureTokenStore.save(server.issueTokens());
  await render(
    <SessionProvider fetch={server.fetch} providers={null}>
      <SettingsScreen notifications={notifications.n} preferences={preferences} />
    </SessionProvider>,
  );
  await screen.findByTestId('settings-screen');
  return { server, notifications, preferences };
}

describe('SettingsScreen', () => {
  beforeEach(async () => {
    await secureTokenStore.clear();
  });
  afterEach(async () => {
    await cleanup();
  });

  it('turns booking reminders off and cancels the pending ones', async () => {
    const { notifications, preferences } = await renderSettings();
    await act(async () => {
      fireEvent(screen.getByTestId('settings-reminders'), 'valueChange', false);
    });
    expect(preferences.value).toBe(false);
    expect(notifications.scheduled.size).toBe(0);
  });

  it('keeps reminders off and explains when the phone denies permission', async () => {
    const { preferences } = await renderSettings({ granted: false, reminders: false });
    await act(async () => {
      fireEvent(screen.getByTestId('settings-reminders'), 'valueChange', true);
    });
    expect(await screen.findByTestId('settings-permission-denied')).toBeTruthy();
    expect(preferences.value).toBe(false);
  });

  it('saves the training opt-out right away with PATCH /me', async () => {
    const { server } = await renderSettings();
    await screen.findByTestId('settings-training-opt-out');
    await act(async () => {
      fireEvent(screen.getByTestId('settings-training-opt-out'), 'valueChange', true);
    });
    await screen.findByTestId('settings-opt-out-saved');
    const patch = server.requests.find((r) => r.path === '/me' && r.method === 'PATCH');
    expect(patch?.body).toEqual({ training_opt_out: true });
    expect(screen.getByTestId('settings-training-opt-out').props.value).toBe(true);
  });

  it('deletes the account after confirming and drops pending reminders', async () => {
    const { server, notifications } = await renderSettings();
    await fireEvent.press(screen.getByTestId('profile-delete'));
    await fireEvent.press(screen.getByTestId('profile-delete-confirm-button'));
    await screen.findByTestId('profile-deleted');
    expect(server.requests.some((r) => r.path === '/me' && r.method === 'DELETE')).toBe(true);
    expect(notifications.scheduled.size).toBe(0);
  });
});
