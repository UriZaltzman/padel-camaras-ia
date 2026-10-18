// Session tokens live only in the OS keychain / keystore (expo-secure-store), never in
// AsyncStorage or logs.
import * as SecureStore from 'expo-secure-store';

import type { Schema } from '@app/contracts';

export type StoredTokens = Pick<Schema<'TokenPair'>, 'access_token' | 'refresh_token'>;

const ACCESS_KEY = 'session.access_token';
const REFRESH_KEY = 'session.refresh_token';
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export interface TokenStore {
  load(): Promise<StoredTokens | null>;
  save(tokens: StoredTokens): Promise<void>;
  clear(): Promise<void>;
}

export const secureTokenStore: TokenStore = {
  async load() {
    const [access, refresh] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_KEY, options),
      SecureStore.getItemAsync(REFRESH_KEY, options),
    ]);
    return access && refresh ? { access_token: access, refresh_token: refresh } : null;
  },
  async save(tokens) {
    await SecureStore.setItemAsync(ACCESS_KEY, tokens.access_token, options);
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh_token, options);
  },
  async clear() {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY, options),
      SecureStore.deleteItemAsync(REFRESH_KEY, options),
    ]);
  },
};
