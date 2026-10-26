import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Text } from 'react-native';

import { brand } from '@app/config/brand';

import { SignInScreen } from '../auth/SignInScreen';
import { createMockAuthServer, type MockAuthServer } from '../auth/mock-api';
import { createFakeProviders, ProviderCancelledError } from '../auth/providers';
import { SessionProvider, useSession } from '../auth/session';
import { secureTokenStore } from '../auth/token-store';
import { i18n } from '../i18n';
import { esAR } from '../i18n/locales';

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

const PHONE = '+5491155550123';

function Status() {
  const { status } = useSession();
  return <Text testID="status">{status}</Text>;
}

async function renderSignIn(server: MockAuthServer, providers = createFakeProviders()) {
  await render(
    <SessionProvider fetch={server.fetch} providers={providers}>
      <Status />
      <SignInScreen />
    </SessionProvider>,
  );
}

async function enterPhoneAndCode(code: string) {
  await fireEvent.changeText(screen.getByTestId('phone-input'), '11 5555 0123');
  await fireEvent.press(screen.getByTestId('send-code'));
  await screen.findByTestId('code-input');
  await fireEvent.changeText(screen.getByTestId('code-input'), code);
  await fireEvent.press(screen.getByTestId('verify-code'));
}

const status = () => screen.getByTestId('status').props.children as string;

describe('SignInScreen', () => {
  beforeEach(async () => {
    await secureTokenStore.clear();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await cleanup();
    await act(() => i18n.changeLanguage('es-AR'));
  });

  it('signs in an existing user with the WhatsApp code and stores tokens securely', async () => {
    const server = createMockAuthServer({ existingPhones: [PHONE] });
    await renderSignIn(server);
    expect(screen.getByText(esAR.signIn.phone.title.replace('{brand}', brand.name))).toBeTruthy();

    await enterPhoneAndCode('123456');

    expect(status()).toBe('signedIn');
    expect(server.requests.map((r) => r.path)).toEqual(['/auth/otp/whatsapp', '/auth/otp/verify']);
    expect(server.requests[0]?.body).toEqual({ phone: PHONE });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'session.refresh_token',
      expect.stringMatching(/^refresh-/),
      expect.objectContaining({ keychainAccessible: 'afterFirstUnlockThisDeviceOnly' }),
    );
    expect(await secureTokenStore.load()).toEqual({
      access_token: expect.stringMatching(/^access-/),
      refresh_token: expect.stringMatching(/^refresh-/),
    });
  });

  it('shows the attempts left on a wrong code', async () => {
    const server = createMockAuthServer({ existingPhones: [PHONE] });
    await renderSignIn(server);
    await enterPhoneAndCode('999999');

    expect(screen.getByTestId('sign-in-error')).toHaveTextContent(
      esAR.signIn.errors.OTP_INVALID_other.replace('{count}', '4'),
    );
    expect(status()).toBe('signedOut');
    expect(await secureTokenStore.load()).toBeNull();
  });

  it('blocks after too many attempts', async () => {
    const server = createMockAuthServer({ existingPhones: [PHONE] });
    await renderSignIn(server);
    await enterPhoneAndCode('999999');
    for (let i = 0; i < 4; i += 1) {
      await fireEvent.press(screen.getByTestId('verify-code'));
    }
    expect(screen.getByTestId('sign-in-error')).toHaveTextContent(
      esAR.signIn.errors.OTP_ATTEMPTS_EXCEEDED,
    );
  });

  it('asks for a new code when it expired', async () => {
    const server = createMockAuthServer({ existingPhones: [PHONE] });
    await renderSignIn(server);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '+54 9 11 5555 0123');
    await fireEvent.press(screen.getByTestId('send-code'));
    server.expireCode();
    await fireEvent.changeText(screen.getByTestId('code-input'), '123456');
    await fireEvent.press(screen.getByTestId('verify-code'));

    expect(screen.getByTestId('sign-in-error')).toHaveTextContent(esAR.signIn.errors.OTP_EXPIRED);
    expect(status()).toBe('signedOut');
  });

  it('requires terms and privacy on first sign-in and sends the consent versions', async () => {
    const server = createMockAuthServer();
    await renderSignIn(server);
    await enterPhoneAndCode('123456');

    expect(screen.getByText(esAR.signIn.terms.title)).toBeTruthy();
    expect(status()).toBe('signedOut');
    expect(screen.getByTestId('accept-terms')).toBeDisabled();

    await fireEvent.press(screen.getByTestId('accept-terms-checkbox'));
    await fireEvent.press(screen.getByTestId('accept-terms'));

    expect(status()).toBe('signedIn');
    const last = server.requests.at(-1);
    expect(last?.path).toBe('/auth/otp/verify');
    expect(last?.body).toEqual({
      phone: PHONE,
      code: '123456',
      consent: { terms_version: '2026-10-01', privacy_version: '2026-10-01' },
    });
  });

  it('signs in with Apple through the provider interface, forwarding name and nonce', async () => {
    const server = createMockAuthServer({ existingOAuth: true });
    await renderSignIn(server);
    await fireEvent.press(screen.getByTestId('apple-sign-in'));

    expect(status()).toBe('signedIn');
    expect(server.requests[0]).toEqual({
      path: '/auth/oauth/apple',
      method: 'POST',
      body: {
        id_token: 'fake-apple-id-token',
        nonce: 'fake-nonce-apple',
        full_name: 'Sofía Pérez',
      },
    });
  });

  it('asks for terms on a new Google account and stays quiet if the user cancels the SDK', async () => {
    const server = createMockAuthServer();
    await renderSignIn(server);
    await fireEvent.press(screen.getByTestId('google-sign-in'));
    expect(screen.getByText(esAR.signIn.terms.title)).toBeTruthy();
    await cleanup();

    const cancelling = createFakeProviders({
      google: () => Promise.reject(new ProviderCancelledError()),
    });
    await renderSignIn(createMockAuthServer(), cancelling);
    await fireEvent.press(screen.getByTestId('google-sign-in'));
    expect(screen.queryByTestId('sign-in-error')).toBeNull();
  });

  it('hides Google and Apple and says they are unavailable when the build has no providers', async () => {
    await render(
      <SessionProvider fetch={createMockAuthServer().fetch} providers={null}>
        <SignInScreen />
      </SessionProvider>,
    );
    expect(screen.queryByTestId('google-sign-in')).toBeNull();
    expect(screen.queryByTestId('apple-sign-in')).toBeNull();
    expect(screen.getByText(esAR.signIn.socialUnavailable)).toBeTruthy();
  });

  it('takes every text from i18n, none hardcoded', async () => {
    await act(() => i18n.changeLanguage('cimode'));
    const server = createMockAuthServer();
    await render(
      <SessionProvider fetch={server.fetch} providers={createFakeProviders()}>
        <SignInScreen />
      </SessionProvider>,
    );
    const check = () => {
      const texts: string[] = [];
      const walk = (node: unknown): void => {
        if (typeof node === 'string') texts.push(node);
        else if (Array.isArray(node)) node.forEach(walk);
        else if (node && typeof node === 'object' && 'children' in node) {
          walk((node as { children: unknown }).children);
        }
      };
      walk(screen.toJSON());
      expect(texts.length).toBeGreaterThan(0);
      for (const text of texts) expect(text).toMatch(/^signIn\./);
    };
    check();
    expect(screen.getByTestId('phone-input').props.placeholder).toBe('signIn.phone.placeholder');
    await fireEvent.changeText(screen.getByTestId('phone-input'), '11 5555 0123');
    await fireEvent.press(screen.getByTestId('send-code'));
    check();
    await fireEvent.changeText(screen.getByTestId('code-input'), '123456');
    await fireEvent.press(screen.getByTestId('verify-code'));
    check();
  });
});
