import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { hash, parseOptions, verify } from '@node-rs/argon2';
import type { Env } from '../../config/env';
import { ENV } from '../../config/env.module';
import { normalizePassword } from './password-policy';

/**
 * OWASP minimum for Argon2id (m=19 MiB, t=2, p=1). Raise these over time: `needsRehash` then moves
 * every account at its next login. The library draws a fresh 16-byte random salt per hash.
 */
export const ARGON2_PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
/** `Algorithm.Argon2id` of the library (a `const enum`, so the value is written out). */
const ARGON2ID = 2;

const DEV_PEPPER = 'development-only-password-pepper-not-for-production';

export interface PepperSet {
  versions: ReadonlyMap<number, string>;
  current: number;
}

/** Reads `AUTH_PASSWORD_PEPPERS` / `AUTH_PASSWORD_PEPPER_VERSION`. Throws (without values) if wrong. */
export function loadPeppers(
  env: Pick<Env, 'AUTH_PASSWORD_PEPPERS' | 'AUTH_PASSWORD_PEPPER_VERSION'>,
): PepperSet {
  if (env.AUTH_PASSWORD_PEPPERS === undefined) {
    return { versions: new Map([[1, DEV_PEPPER]]), current: 1 };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(env.AUTH_PASSWORD_PEPPERS);
  } catch {
    throw new Error('AUTH_PASSWORD_PEPPERS is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('AUTH_PASSWORD_PEPPERS must be an object of version to secret');
  }
  const versions = new Map<number, string>();
  for (const [key, secret] of Object.entries(parsed)) {
    const version = Number(key);
    if (
      !Number.isInteger(version) ||
      version < 1 ||
      typeof secret !== 'string' ||
      secret.length < 32
    ) {
      throw new Error('AUTH_PASSWORD_PEPPERS has an invalid version or a secret shorter than 32');
    }
    versions.set(version, secret);
  }
  if (versions.size === 0) throw new Error('AUTH_PASSWORD_PEPPERS is empty');
  const current = env.AUTH_PASSWORD_PEPPER_VERSION ?? Math.max(...versions.keys());
  if (!versions.has(current)) throw new Error('AUTH_PASSWORD_PEPPER_VERSION is not in the set');
  return { versions, current };
}

export interface PasswordHash {
  /** PHC string: `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`. */
  hash: string;
  pepperVersion: number;
}

/**
 * Argon2id with a pepper. The password goes through HMAC-SHA256 keyed by the pepper first, so the
 * Argon2 input has a fixed size (any password length and any Unicode is fine) and a stolen
 * database alone cannot be attacked offline without the pepper from the secrets manager.
 */
@Injectable()
export class PasswordHasher {
  private readonly peppers: PepperSet;
  /** Verified against when the account does not exist, so a miss costs as much as a hit. */
  private dummy: Promise<string> | undefined;

  constructor(
    @Inject(ENV) env: Pick<Env, 'AUTH_PASSWORD_PEPPERS' | 'AUTH_PASSWORD_PEPPER_VERSION'>,
  ) {
    this.peppers = loadPeppers(env);
  }

  get currentPepperVersion(): number {
    return this.peppers.current;
  }

  async hash(password: string): Promise<PasswordHash> {
    const version = this.peppers.current;
    const phc = await hash(this.prehash(password, version), {
      ...ARGON2_PARAMS,
      algorithm: ARGON2ID,
    });
    return { hash: phc, pepperVersion: version };
  }

  async verify(stored: string, pepperVersion: number, password: string): Promise<boolean> {
    if (!this.peppers.versions.has(pepperVersion)) return false;
    try {
      return await verify(stored, this.prehash(password, pepperVersion));
    } catch {
      return false;
    }
  }

  /** Spends the time of a real check on an account that does not exist. Always false. */
  async verifyDummy(password: string): Promise<false> {
    this.dummy ??= this.hash(randomBytes(24).toString('hex')).then((h) => h.hash);
    await verify(await this.dummy, this.prehash(password, this.peppers.current)).catch(() => false);
    return false;
  }

  /** True when the hash is not Argon2id with today's parameters, or uses an older pepper. */
  needsRehash(stored: string, pepperVersion: number): boolean {
    if (pepperVersion !== this.peppers.current) return true;
    try {
      const p = parseOptions(stored);
      return (
        p.algorithm !== ARGON2ID ||
        p.memoryCost < ARGON2_PARAMS.memoryCost ||
        p.timeCost < ARGON2_PARAMS.timeCost ||
        p.parallelism !== ARGON2_PARAMS.parallelism
      );
    } catch {
      return true;
    }
  }

  private prehash(password: string, version: number): string {
    const pepper = this.peppers.versions.get(version) as string;
    return createHmac('sha256', pepper)
      .update(normalizePassword(password), 'utf8')
      .digest('base64');
  }
}

/** Constant-time string comparison (equal length enforced by hashing both). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
