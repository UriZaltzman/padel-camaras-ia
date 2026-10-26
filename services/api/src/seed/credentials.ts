/**
 * HOOK FOR THE PASSWORD LOGIN (#343). Staff and owners sign in with a WhatsApp code today, so the
 * seed stores no secret. When password login lands, return here the dev-only credentials of the
 * seeded staff (identity key -> already hashed password), never a plain text password and never
 * anything that would be valid outside the e2e stack. The seed writes them next to the users.
 */
export interface SeedCredential {
  /** Email of the seeded user (see `data.ts`). */
  email: string;
  /** Hash produced by the same function the login uses to verify. */
  passwordHash: string;
}

export function seedCredentials(): SeedCredential[] {
  return [];
}
