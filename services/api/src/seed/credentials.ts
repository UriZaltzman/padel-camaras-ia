import { PasswordHasher } from '../auth/credentials/password-hasher';
import { checkPassword } from '../auth/credentials/password-policy';
import { CLUBS, peopleOf } from './data';

/**
 * Dev-only logins of the seeded club owners and receptionists (password login, #343).
 *
 * The password is fictional and only meant for the e2e stack and local development: `run.ts`
 * refuses to seed production or a remote database. It can be replaced with `SEED_PASSWORD`. It is
 * hashed here, at seed time, with the same Argon2id parameters and pepper the API uses, so the
 * seeded users sign in through the real login; the database only ever holds the hash. Internal
 * staff are not seeded: they need an authenticator (TOTP) enrolled on first login.
 */
export const DEFAULT_SEED_PASSWORD = 'clave-de-prueba-del-seed-2026';

export interface SeedCredential {
  userId: string;
  /** Email of the seeded user (see `data.ts`). */
  email: string;
  /** PHC Argon2id hash produced by the same function the login uses to verify. */
  passwordHash: string;
  pepperVersion: number;
}

export async function seedCredentials(
  env: Record<string, string | undefined> = process.env,
): Promise<SeedCredential[]> {
  const password = env.SEED_PASSWORD ?? DEFAULT_SEED_PASSWORD;
  const hasher = new PasswordHasher({
    AUTH_PASSWORD_PEPPERS: env.AUTH_PASSWORD_PEPPERS,
    AUTH_PASSWORD_PEPPER_VERSION: env.AUTH_PASSWORD_PEPPER_VERSION
      ? Number(env.AUTH_PASSWORD_PEPPER_VERSION)
      : undefined,
  });
  const logins = CLUBS.flatMap((club) =>
    peopleOf(club).filter((person) => person.role === 'owner' || person.role === 'staff'),
  );
  const credentials: SeedCredential[] = [];
  for (const person of logins) {
    const problems = checkPassword(password, { email: person.email });
    if (problems.length > 0) {
      throw new Error(`The seed password breaks the password policy: ${problems.join(', ')}`);
    }
    const hashed = await hasher.hash(password);
    credentials.push({
      userId: person.id,
      email: person.email,
      passwordHash: hashed.hash,
      pepperVersion: hashed.pepperVersion,
    });
  }
  return credentials;
}
