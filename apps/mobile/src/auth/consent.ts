import type { Schema } from '@app/contracts';

// Versions of the terms and privacy policy the app shows (Ley 25.326). Bump them together
// with the legal texts; the server stores what the user accepted.
export const currentConsent: Schema<'SignUpConsent'> = {
  terms_version: '2026-10-01',
  privacy_version: '2026-10-01',
};
