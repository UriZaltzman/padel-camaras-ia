import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

// RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30 s) as every authenticator app expects, and RFC 4648 base32.
// Written against node:crypto instead of adding a dependency; checked with the RFC test vectors.

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Steps accepted before/after the current one, for clock drift between phone and server. */
export const TOTP_WINDOW = 1;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): Buffer {
  return randomBytes(20);
}

export function totpAt(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', secret).update(counter).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 15;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

/**
 * The step a code belongs to (within the window), or null. A step at or before `lastStep` is
 * refused: a code that already worked once cannot be replayed.
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  nowMs: number,
  lastStep: number | null,
): number | null {
  if (!/^[0-9]{6}$/.test(code)) return null;
  const now = totpStep(nowMs);
  let found: number | null = null;
  // Walks every step so the time taken does not depend on which one matched.
  for (let step = now - TOTP_WINDOW; step <= now + TOTP_WINDOW; step++) {
    const expected = totpAt(secret, step);
    let diff = 0;
    for (let i = 0; i < TOTP_DIGITS; i++) diff |= expected.charCodeAt(i) ^ code.charCodeAt(i);
    if (diff === 0 && (lastStep === null || step > lastStep)) found = step;
  }
  return found;
}

export function otpauthUri(secret: Buffer, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${base32Encode(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

// ---- encryption of the secret at rest: AES-256-GCM, `v1.<iv>.<tag>.<ciphertext>` in base64url.

function encryptionKey(secret: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', secret, 'totp-at-rest', 'user_credentials.totp_secret_enc', 32),
  );
}

export function encryptSecret(plain: Buffer, keyMaterial: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(keyMaterial), iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export function decryptSecret(stored: string, keyMaterial: string): Buffer {
  const [version, iv, tag, data] = stored.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('unknown secret format');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(keyMaterial),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]);
}
