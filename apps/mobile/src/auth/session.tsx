// The session is the only global state of the app (CLAUDE.md). Tokens go to the secure store;
// the API client gets them through createAuthedFetch, which also rotates the refresh token.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { z } from 'zod';

import { createApiClient } from '@app/contracts';
import type { Schema } from '@app/contracts';

import { ApiProvider, apiBaseUrl } from '../api/client';
import { createAuthedFetch, type Fetch } from './authed-fetch';
import { createMockAuthServer } from './mock-api';
import { createFakeProviders, type SocialAuthProviders } from './providers';
import { secureTokenStore, type TokenStore } from './token-store';

export type SessionStatus = 'loading' | 'signedIn' | 'signedOut';

interface SessionContextValue {
  status: SessionStatus;
  user: Schema<'User'> | null;
  providers: SocialAuthProviders;
  startSession(session: Schema<'AuthSession'>): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

const mockSchema = z.object({ EXPO_PUBLIC_API_MOCK: z.enum(['true', 'false']).default('false') });

function defaultFetch(): Fetch {
  const { EXPO_PUBLIC_API_MOCK } = mockSchema.parse({
    EXPO_PUBLIC_API_MOCK: process.env.EXPO_PUBLIC_API_MOCK,
  });
  if (EXPO_PUBLIC_API_MOCK === 'true') return createMockAuthServer().fetch;
  return (input) => globalThis.fetch(input);
}

interface SessionProviderProps {
  children: ReactNode;
  store?: TokenStore;
  /** Injected in tests: the contract mock. */
  fetch?: Fetch;
  /** Google/Apple SDKs. Fake until the real credentials exist. */
  providers?: SocialAuthProviders;
}

export function SessionProvider({ children, store, fetch, providers }: SessionProviderProps) {
  const tokenStore = store ?? secureTokenStore;
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<Schema<'User'> | null>(null);
  const [social] = useState(() => providers ?? createFakeProviders());

  const [client] = useState(() => {
    const baseUrl = apiBaseUrl();
    return createApiClient({
      baseUrl,
      fetch: createAuthedFetch({
        baseUrl,
        baseFetch: fetch ?? defaultFetch(),
        store: tokenStore,
        onSessionLost: () => {
          setUser(null);
          setStatus('signedOut');
        },
      }),
    });
  });

  useEffect(() => {
    let active = true;
    void tokenStore.load().then((tokens) => {
      if (active) setStatus(tokens ? 'signedIn' : 'signedOut');
    });
    return () => {
      active = false;
    };
  }, [tokenStore]);

  const startSession = useCallback(
    async (session: Schema<'AuthSession'>) => {
      await tokenStore.save({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      setUser(session.user);
      setStatus('signedIn');
    },
    [tokenStore],
  );

  const signOut = useCallback(async () => {
    await tokenStore.clear();
    setUser(null);
    setStatus('signedOut');
  }, [tokenStore]);

  const value = useMemo(
    () => ({ status, user, providers: social, startSession, signOut }),
    [status, user, social, startSession, signOut],
  );

  return (
    <SessionContext.Provider value={value}>
      <ApiProvider client={client}>{children}</ApiProvider>
    </SessionContext.Provider>
  );
}
