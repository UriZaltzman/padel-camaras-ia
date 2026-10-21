import type { Schema } from '@app/contracts';

// Versions of the terms and privacy policy the web shows (Ley 25.326), the same ones as the app
// (apps/mobile/src/auth/consent.ts). Bump them together with the legal texts.
export const currentConsent: Schema<'SignUpConsent'> = {
  terms_version: '2026-10-01',
  privacy_version: '2026-10-01',
};
