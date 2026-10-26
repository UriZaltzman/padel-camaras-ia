import type { PrismaClient } from '@prisma/client';
import { newId } from '../../db/ids';
import { CredentialsRepository } from './credentials.repository';
import { PasswordHasher } from './password-hasher';
import { checkPassword } from './password-policy';

export interface SeedLogin {
  /** Fixed ids keep seeds repeatable. */
  userId?: string;
  name: string;
  email: string;
  /** Plain text only inside the seed script; it is hashed here and never stored or logged. */
  password: string;
}

/**
 * Seed hook (dev and test data only): gives each account an Argon2id credential, hashed now with
 * the same parameters and pepper the API uses, so seeded users sign in through the real login.
 *
 * Use it from the seed script with the migration-role client:
 *
 *   await seedCredentials(prisma, [{ name: 'Dueño Demo', email: 'owner@demo.test', password: '…' }]);
 *
 * It refuses to run in production and rejects passwords that break the policy.
 */
export async function seedCredentials(
  client: PrismaClient,
  logins: readonly SeedLogin[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ email: string; userId: string }[]> {
  if (env.NODE_ENV === 'production') throw new Error('seedCredentials never runs in production');
  const hasher = new PasswordHasher({
    AUTH_PASSWORD_PEPPERS: env.AUTH_PASSWORD_PEPPERS,
    AUTH_PASSWORD_PEPPER_VERSION: env.AUTH_PASSWORD_PEPPER_VERSION
      ? Number(env.AUTH_PASSWORD_PEPPER_VERSION)
      : undefined,
  });
  const repo = new CredentialsRepository();
  const done: { email: string; userId: string }[] = [];
  for (const login of logins) {
    const email = login.email.normalize('NFKC').trim().toLowerCase();
    const problems = checkPassword(login.password, { email });
    if (problems.length > 0) {
      throw new Error(`Seed password for ${email} breaks the policy: ${problems.join(', ')}`);
    }
    const hashed = await hasher.hash(login.password);
    const userId = login.userId ?? newId();
    await client.$transaction((tx) =>
      repo.upsertWithPassword(tx, {
        userId,
        name: login.name,
        email,
        hash: hashed.hash,
        pepperVersion: hashed.pepperVersion,
      }),
    );
    done.push({ email, userId });
  }
  return done;
}
