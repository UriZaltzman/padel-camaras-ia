// Google and Apple SDKs sit behind this interface so screens and tests never depend on them.
// The real implementations (expo-auth-session / expo-apple-authentication) arrive once the
// store credentials exist; until then dev and tests use the fake below.

export interface ProviderToken {
  idToken: string;
  /** Raw nonce sent to the provider, forwarded so the server checks the `nonce` claim. */
  nonce: string;
  /** Apple sends the name only on the first authorization. */
  fullName?: string;
}

/** The user closed the provider sheet; not an error to show. */
export class ProviderCancelledError extends Error {
  constructor() {
    super('provider sign-in cancelled');
    this.name = 'ProviderCancelledError';
  }
}

export interface SocialAuthProviders {
  google(): Promise<ProviderToken>;
  apple(): Promise<ProviderToken>;
}

export function createFakeProviders(
  overrides: Partial<SocialAuthProviders> = {},
): SocialAuthProviders {
  return {
    google: async () => ({ idToken: 'fake-google-id-token', nonce: 'fake-nonce-google' }),
    apple: async () => ({
      idToken: 'fake-apple-id-token',
      nonce: 'fake-nonce-apple',
      fullName: 'Sofía Pérez',
    }),
    ...overrides,
  };
}
