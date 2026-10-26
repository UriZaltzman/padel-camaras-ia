import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock';
import { newId } from '../../db/ids';
import { AppError } from '../../errors/app-error';
import { JwtSigner, type AccessClaims } from './jwt';
import { SESSION_STORE, type SessionStore } from './session-store';

export const ACCESS_TTL_SECONDS = 900;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
export const JWT_SIGNER = Symbol('JWT_SIGNER');

/** Shape of the contract's `TokenPair`. */
export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

export interface AccessIdentity {
  userId: string;
  sessionId: string;
  /** The sign-in used a second factor. */
  mfa?: boolean;
}

const REFRESH_FORMAT = /^rt_([0-9a-f-]{36})\.([A-Za-z0-9_-]{20,})$/;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/**
 * Sessions: a 15-minute access JWT plus a 30-day refresh token that is single use. Using a
 * refresh token a second time revokes its whole family, access tokens included.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(SESSION_STORE) private readonly store: SessionStore,
    @Inject(JWT_SIGNER) private readonly jwt: JwtSigner,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Starts a session (a new token family) after a successful sign-in. */
  async issue(userId: string, options: { mfa?: boolean } = {}): Promise<TokenPair> {
    return this.mint(userId, newId(), await this.store.getEpoch(userId), options.mfa ?? false);
  }

  /**
   * Ends every session of the user, access tokens included (after a password reset or change).
   * Sessions started afterwards are unaffected.
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.store.bumpEpoch(userId);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const match = REFRESH_FORMAT.exec(refreshToken);
    if (!match) throw new AppError('REFRESH_TOKEN_INVALID');
    const [, id = '', secret = ''] = match;

    const record = await this.store.markUsed(id);
    if (!record || !this.sameSecret(record.secretHash, sha256(secret))) {
      throw new AppError('REFRESH_TOKEN_INVALID');
    }
    if (record.used) {
      // A token that was already exchanged is back: someone holds a copy. End the session.
      await this.store.revokeFamily(record.familyId, REFRESH_TTL_SECONDS);
      throw new AppError('REFRESH_TOKEN_INVALID');
    }
    if (await this.store.isFamilyRevoked(record.familyId)) {
      throw new AppError('REFRESH_TOKEN_INVALID');
    }
    if (record.epoch !== (await this.store.getEpoch(record.userId))) {
      throw new AppError('REFRESH_TOKEN_INVALID');
    }
    return this.mint(record.userId, record.familyId, record.epoch, record.mfa);
  }

  /** Validates an access token. Distinguishes an expired one so clients know to refresh. */
  async authenticate(accessToken: string): Promise<AccessIdentity> {
    const check = this.jwt.check(accessToken, this.nowSeconds());
    if (check.status === 'expired') throw new AppError('ACCESS_TOKEN_EXPIRED');
    if (check.status === 'invalid') throw new AppError('UNAUTHENTICATED');
    const { sub, sid } = check.claims;
    if (await this.store.isFamilyRevoked(sid)) throw new AppError('UNAUTHENTICATED');
    if ((check.claims.ep ?? 0) !== (await this.store.getEpoch(sub))) {
      throw new AppError('UNAUTHENTICATED');
    }
    return { userId: sub, sessionId: sid, mfa: check.claims.mfa === true };
  }

  /** Ends a session: its refresh tokens stop working and its access tokens are refused. */
  revokeSession(sessionId: string): Promise<void> {
    return this.store.revokeFamily(sessionId, REFRESH_TTL_SECONDS);
  }

  private async mint(
    userId: string,
    familyId: string,
    epoch: number,
    mfa: boolean,
  ): Promise<TokenPair> {
    const now = this.nowSeconds();
    const claims: AccessClaims = {
      sub: userId,
      sid: familyId,
      iat: now,
      exp: now + ACCESS_TTL_SECONDS,
      ep: epoch,
      mfa,
    };
    const id = newId();
    const secret = randomBytes(32).toString('base64url');
    await this.store.save(
      { id, secretHash: sha256(secret), userId, familyId, used: false, epoch, mfa },
      REFRESH_TTL_SECONDS,
    );
    return {
      access_token: this.jwt.sign(claims),
      refresh_token: `rt_${id}.${secret}`,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_SECONDS,
    };
  }

  private nowSeconds(): number {
    return Math.floor(this.clock.now().getTime() / 1000);
  }

  private sameSecret(expectedHash: string, actualHash: string): boolean {
    return (
      expectedHash.length === actualHash.length &&
      timingSafeEqual(Buffer.from(expectedHash), Buffer.from(actualHash))
    );
  }
}
