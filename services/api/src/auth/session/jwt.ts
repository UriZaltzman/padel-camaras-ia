import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

export interface AccessClaims {
  /** User id. */
  sub: string;
  /** Session (refresh token family) id; lets a revoked session cut its access tokens short. */
  sid: string;
  iat: number;
  exp: number;
}

export type JwtCheck =
  { status: 'valid'; claims: AccessClaims } | { status: 'expired' } | { status: 'invalid' };

const HEADER = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');

/** ES256 JWTs with node:crypto (no dependency). Signatures use the raw r||s form JWT requires. */
export class JwtSigner {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  /** `pem` is a PKCS#8 EC P-256 private key; without it a throwaway key is generated. */
  constructor(pem?: string) {
    this.privateKey = pem
      ? createPrivateKey(pem.replaceAll('\\n', '\n'))
      : generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    this.publicKey = createPublicKey(this.privateKey);
  }

  sign(claims: AccessClaims): string {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = sign('sha256', Buffer.from(`${HEADER}.${payload}`), {
      key: this.privateKey,
      dsaEncoding: 'ieee-p1363',
    });
    return `${HEADER}.${payload}.${signature.toString('base64url')}`;
  }

  check(token: string, nowSeconds: number): JwtCheck {
    const parts = token.split('.');
    const [header, payload, signature] = parts;
    if (parts.length !== 3 || header !== HEADER || !payload || !signature) {
      return { status: 'invalid' };
    }
    const signatureOk = verify(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      { key: this.publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url'),
    );
    if (!signatureOk) return { status: 'invalid' };
    let claims: unknown;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      return { status: 'invalid' };
    }
    if (!isClaims(claims)) return { status: 'invalid' };
    return nowSeconds >= claims.exp ? { status: 'expired' } : { status: 'valid', claims };
  }
}

function isClaims(value: unknown): value is AccessClaims {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sub === 'string' &&
    typeof v.sid === 'string' &&
    typeof v.iat === 'number' &&
    typeof v.exp === 'number'
  );
}
