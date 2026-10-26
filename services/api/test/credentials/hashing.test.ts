import { describe, expect, it } from 'vitest';
import {
  ARGON2_PARAMS,
  PasswordHasher,
  loadPeppers,
} from '../../src/auth/credentials/password-hasher';
import { checkPassword } from '../../src/auth/credentials/password-policy';
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  totpAt,
  verifyTotp,
} from '../../src/auth/credentials/totp';

const PEPPER_1 = 'pepper-one-pepper-one-pepper-one-1234';
const PEPPER_2 = 'pepper-two-pepper-two-pepper-two-5678';
const hasherWith = (peppers: Record<string, string>, version?: number) =>
  new PasswordHasher({
    AUTH_PASSWORD_PEPPERS: JSON.stringify(peppers),
    AUTH_PASSWORD_PEPPER_VERSION: version,
  });

describe('password hashing', () => {
  it('produces a PHC Argon2id string with the OWASP parameters and a fresh salt each time', async () => {
    const hasher = hasherWith({ '1': PEPPER_1 });
    const a = await hasher.hash('correct horse battery staple');
    const b = await hasher.hash('correct horse battery staple');
    expect(a.hash).toMatch(
      new RegExp(
        `^\\$argon2id\\$v=19\\$m=${ARGON2_PARAMS.memoryCost},t=${ARGON2_PARAMS.timeCost},p=${ARGON2_PARAMS.parallelism}\\$[A-Za-z0-9+/]+\\$[A-Za-z0-9+/]+$`,
      ),
    );
    expect(ARGON2_PARAMS).toEqual({ memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    expect(a.hash).not.toBe(b.hash);
    expect(a.hash).not.toContain('correct horse');
    expect(a.pepperVersion).toBe(1);
  });

  it('verifies the right password and only that one, any Unicode and any length', async () => {
    const hasher = hasherWith({ '1': PEPPER_1 });
    const long = `contraseña ñandú 🎾 ${'x'.repeat(900)}`;
    const { hash, pepperVersion } = await hasher.hash(long);
    expect(await hasher.verify(hash, pepperVersion, long)).toBe(true);
    expect(await hasher.verify(hash, pepperVersion, `${long}y`)).toBe(false);
    // Composed and decomposed accents are the same password.
    const composed = await hasher.hash('canción larga 123');
    expect(await hasher.verify(composed.hash, 1, 'canción larga 123'.normalize('NFD'))).toBe(true);
  });

  it('depends on the pepper: the same hash with another pepper does not verify', async () => {
    const one = hasherWith({ '1': PEPPER_1 });
    const other = hasherWith({ '1': PEPPER_2 });
    const { hash } = await one.hash('a long enough passphrase');
    expect(await other.verify(hash, 1, 'a long enough passphrase')).toBe(false);
  });

  it('rotates the pepper: old hashes verify and ask for a rehash, new ones do not', async () => {
    const before = hasherWith({ '1': PEPPER_1 });
    const old = await before.hash('a long enough passphrase');
    const after = hasherWith({ '1': PEPPER_1, '2': PEPPER_2 });
    expect(after.currentPepperVersion).toBe(2);
    expect(await after.verify(old.hash, old.pepperVersion, 'a long enough passphrase')).toBe(true);
    expect(after.needsRehash(old.hash, old.pepperVersion)).toBe(true);
    const fresh = await after.hash('a long enough passphrase');
    expect(fresh.pepperVersion).toBe(2);
    expect(after.needsRehash(fresh.hash, fresh.pepperVersion)).toBe(false);
  });

  it('asks for a rehash when the parameters are weaker than today or the algorithm differs', async () => {
    const hasher = hasherWith({ '1': PEPPER_1 });
    expect(
      hasher.needsRehash(
        '$argon2id$v=19$m=4096,t=1,p=1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaA',
        1,
      ),
    ).toBe(true);
    expect(
      hasher.needsRehash('$2b$10$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234', 1),
    ).toBe(true);
    expect(hasher.needsRehash('not a hash', 1)).toBe(true);
  });

  it('never accepts a hash whose pepper version is unknown', async () => {
    const hasher = hasherWith({ '1': PEPPER_1 });
    const { hash } = await hasher.hash('a long enough passphrase');
    expect(await hasher.verify(hash, 9, 'a long enough passphrase')).toBe(false);
  });

  it('rejects malformed pepper configuration without echoing the secrets', () => {
    expect(() => loadPeppers({ AUTH_PASSWORD_PEPPERS: '{"1":"short"}' })).toThrow(/32/);
    expect(() => loadPeppers({ AUTH_PASSWORD_PEPPERS: '{not json' })).toThrow(/JSON/);
    try {
      loadPeppers({ AUTH_PASSWORD_PEPPERS: '{"1":"SECRET-VALUE-SHORT"}' });
    } catch (error) {
      expect(String(error)).not.toContain('SECRET-VALUE');
    }
    expect(() =>
      loadPeppers({
        AUTH_PASSWORD_PEPPERS: `{"1":"${PEPPER_1}"}`,
        AUTH_PASSWORD_PEPPER_VERSION: 3,
      }),
    ).toThrow(/not in the set/);
  });
});

describe('password policy', () => {
  it('requires 10 characters (not bytes), with no maximum worth speaking of, and any Unicode', () => {
    expect(checkPassword('corta')).toContain('too_short');
    expect(checkPassword('ñandúñandú')).toEqual([]);
    expect(checkPassword('🎾🎾🎾🎾🎾🎾🎾🎾🎾🏆')).toEqual([]);
    expect(checkPassword('una frase con espacios y ñ')).toEqual([]);
    expect(checkPassword('x1'.repeat(400))).toEqual([]);
    expect(checkPassword('a'.repeat(2000))).toContain('too_long');
  });

  it('rejects the most common passwords whatever the case, and trivial patterns', () => {
    for (const bad of [
      'Password123',
      'QWERTYUIOP',
      '1234567890',
      'contraseña1',
      'aaaaaaaaaaaa',
      'abcdefghijkl',
    ]) {
      expect(checkPassword(bad), bad).toContain('too_common');
    }
  });

  it('rejects a password built on the email', () => {
    expect(checkPassword('duenio-del-club-1', { email: 'duenio-del-club-1@club.test' })).toContain(
      'contains_email',
    );
  });
});

describe('TOTP (RFC 6238)', () => {
  // RFC 6238 appendix B, SHA-1 secret "12345678901234567890", truncated to 6 digits.
  const secret = Buffer.from('12345678901234567890');
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC vector at t=%i', (seconds, code) => {
    expect(totpAt(secret, Math.floor(seconds / 30))).toBe(code);
  });

  it('accepts one step of drift, refuses a replay and refuses a far-off code', () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, totpAt(secret, step), now, null)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step), now, step)).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, step + 5), now, null)).toBeNull();
    expect(verifyTotp(secret, '12345', now, null)).toBeNull();
  });

  it('round-trips base32 and encrypts the secret at rest', () => {
    const raw = Buffer.from('0123456789abcdefghij');
    expect(base32Decode(base32Encode(raw)).equals(raw)).toBe(true);
    const key = 'k'.repeat(40);
    const stored = encryptSecret(raw, key);
    expect(stored).not.toContain(raw.toString('base64url'));
    expect(decryptSecret(stored, key).equals(raw)).toBe(true);
    expect(() => decryptSecret(stored, 'x'.repeat(40))).toThrow();
    expect(encryptSecret(raw, key)).not.toBe(stored);
  });
});
