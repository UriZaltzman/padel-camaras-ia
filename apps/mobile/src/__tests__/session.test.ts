import { createApiClient } from '@app/contracts';

import { createAuthedFetch } from '../auth/authed-fetch';
import { createMockAuthServer } from '../auth/mock-api';
import type { StoredTokens, TokenStore } from '../auth/token-store';
import { toE164 } from '../auth/phone';

const baseUrl = 'http://mock.test/v1';

function memoryStore(
  initial: StoredTokens | null = null,
): TokenStore & { value: StoredTokens | null } {
  const store = {
    value: initial,
    load: async () => store.value,
    save: async (t: StoredTokens) => {
      store.value = t;
    },
    clear: async () => {
      store.value = null;
    },
  };
  return store;
}

async function signedIn() {
  const server = createMockAuthServer({ existingPhones: ['+5491155550123'] });
  const raw = createApiClient({ baseUrl, fetch: server.fetch });
  await raw.POST('/auth/otp/whatsapp', { body: { phone: '+5491155550123' } });
  const { data } = await raw.POST('/auth/otp/verify', {
    body: { phone: '+5491155550123', code: '123456' },
  });
  if (!data) throw new Error('mock sign-in failed');
  const store = memoryStore({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  return { server, store };
}

describe('refresh token rotation', () => {
  it('rotates once on ACCESS_TOKEN_EXPIRED and retries with the new token', async () => {
    const { server, store } = await signedIn();
    const onSessionLost = jest.fn();
    const client = createApiClient({
      baseUrl,
      fetch: createAuthedFetch({ baseUrl, baseFetch: server.fetch, store, onSessionLost }),
    });
    const before = store.value?.refresh_token;
    server.expireAccessToken();

    const { response } = await client.GET('/me');

    // The mock answers 404 for any valid authenticated request.
    expect(response.status).toBe(404);
    expect(store.value?.refresh_token).not.toBe(before);
    expect(server.requests.filter((r) => r.path === '/auth/refresh')).toHaveLength(1);
    expect(onSessionLost).not.toHaveBeenCalled();
  });

  it('shares one refresh between concurrent requests', async () => {
    const { server, store } = await signedIn();
    const client = createApiClient({
      baseUrl,
      fetch: createAuthedFetch({
        baseUrl,
        baseFetch: server.fetch,
        store,
        onSessionLost: jest.fn(),
      }),
    });
    server.expireAccessToken();
    await Promise.all([client.GET('/me'), client.GET('/me')]);
    expect(server.requests.filter((r) => r.path === '/auth/refresh')).toHaveLength(1);
  });

  it('signs out when the refresh token is rejected', async () => {
    const { server, store } = await signedIn();
    store.value = { access_token: 'stale', refresh_token: 'reused' };
    const onSessionLost = jest.fn();
    const client = createApiClient({
      baseUrl,
      fetch: createAuthedFetch({ baseUrl, baseFetch: server.fetch, store, onSessionLost }),
    });
    await client.GET('/me');
    expect(onSessionLost).toHaveBeenCalled();
    expect(store.value).toBeNull();
  });
});

describe('toE164', () => {
  it.each([
    ['11 5555-0123', '+5491155550123'],
    ['011 15 5555 0123', '+5491155550123'],
    ['+54 9 11 5555 0123', '+5491155550123'],
    ['5491155550123', '+5491155550123'],
  ])('%s -> %s', (input, expected) => {
    expect(toE164(input)).toBe(expected);
  });

  it('rejects garbage', () => {
    expect(toE164('abc')).toBeNull();
    expect(toE164('12')).toBeNull();
  });
});
