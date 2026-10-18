// API access: typed client generated from packages/contracts, plus the TanStack Query cache.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { z } from 'zod';

import { createApiClient } from '@app/contracts';
import type { ApiClient } from '@app/contracts';

const envSchema = z.object({
  // Server root including `/v1`. Falls back to the local API from docker compose.
  EXPO_PUBLIC_API_URL: z.url().default('http://localhost:3000/v1'),
});

export function apiBaseUrl(): string {
  return envSchema.parse({ EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL })
    .EXPO_PUBLIC_API_URL;
}

const ApiContext = createContext<ApiClient | null>(null);

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error('useApi must be used inside <ApiProvider>');
  return client;
}

interface ApiProviderProps {
  children: ReactNode;
  /** Injected in tests (for example a client whose `fetch` returns contract mocks). */
  client?: ApiClient;
  queryClient?: QueryClient;
}

export function ApiProvider({ children, client, queryClient }: ApiProviderProps) {
  const [api] = useState(() => client ?? createApiClient({ baseUrl: apiBaseUrl() }));
  const [queries] = useState(() => queryClient ?? new QueryClient());
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={queries}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}
