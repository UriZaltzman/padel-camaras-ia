import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { StaffDirectory } from '../../admin/staff-directory';
import { CLOCK, type Clock } from '../../common/clock';
import type { Env } from '../../config/env';
import { ENV } from '../../config/env.module';
import { PrismaService } from '../../db/prisma.service';
import { AppError } from '../../errors/app-error';
import { SessionService, type TokenPair } from '../session/session.service';
import { toApiUser } from '../users/user-mapper';
import type { AuthSession } from '../auth.service';
import { AuthAuditService } from './auth-audit.service';
import { CredentialsRepository, type CredentialRow } from './credentials.repository';
import {
  ACCOUNT_POLICY,
  IP_POLICY,
  LOGIN_THROTTLE,
  RESET_REQUEST_POLICY,
  throttleKey,
  type LoginThrottleStore,
} from './login-throttle';
import { PasswordHasher } from './password-hasher';
import { checkPassword } from './password-policy';
import { PASSWORD_RESET_SENDER, type PasswordResetSender } from './password-reset-sender';
import {
  base32Encode,
  decryptSecret,
  encryptSecret,
  newTotpSecret,
  otpauthUri,
  verifyTotp,
} from './totp';
import { brand } from '@app/config/brand';

export const RESET_TOKEN_TTL_SECONDS = 30 * 60;
const RESET_TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;
const DEV_TOTP_KEY = 'development-only-totp-encryption-key-not-for-production';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Lowercase, NFKC, trimmed: the one spelling under which an email is stored and looked up. */
export function normalizeEmail(email: string): string {
  return email.normalize('NFKC').trim().toLowerCase();
}

export interface TotpEnrollment {
  /** Base32 secret to type into an authenticator app, shown once. */
  secret: string;
  otpauth_uri: string;
}

interface Verified {
  userId: string;
  email: string;
  credential: CredentialRow;
}

/**
 * Email + password sign-in for club owners, club staff and internal staff (issue #343).
 *
 * What an attacker can observe is the same whether the account exists or not: one error
 * (`INVALID_CREDENTIALS`), one Argon2 verification of work (a dummy hash when there is no
 * account), and lock-outs that are keyed by the typed address, not by the account.
 */
@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);
  private readonly totpKey: string;
  private readonly deliveries = new Set<Promise<void>>();

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(CredentialsRepository) private readonly repo: CredentialsRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(StaffDirectory) private readonly staff: StaffDirectory,
    @Inject(AuthAuditService) private readonly audit: AuthAuditService,
    @Inject(LOGIN_THROTTLE) private readonly throttle: LoginThrottleStore,
    @Inject(PASSWORD_RESET_SENDER) private readonly sender: PasswordResetSender,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) env: Env,
  ) {
    this.totpKey = env.AUTH_TOTP_ENCRYPTION_KEY ?? DEV_TOTP_KEY;
  }

  // ------------------------------------------------------------------ sign in

  async login(input: {
    email: string;
    password: string;
    totpCode?: string;
    ip: string;
  }): Promise<AuthSession> {
    const verified = await this.verifyPassword(input.email, input.password, input.ip);
    const member = await this.staff.find(verified.userId);
    if (!member) return this.complete(verified, input.password, false);

    // Internal staff never get a session without the second factor.
    const { totpSecretEnc, totpConfirmedAt } = verified.credential;
    if (!totpSecretEnc || !totpConfirmedAt) {
      throw new AppError('SECOND_FACTOR_REQUIRED', { enrollment_required: true });
    }
    if (!input.totpCode) {
      throw new AppError('SECOND_FACTOR_REQUIRED', { enrollment_required: false });
    }
    await this.verifyTotpCode(verified, input.totpCode, input.ip, false);
    return this.complete(verified, input.password, true);
  }

  /** First step of 2FA setup for internal staff: proves the password, returns a fresh secret. */
  async startTotpEnrollment(input: {
    email: string;
    password: string;
    ip: string;
  }): Promise<TotpEnrollment> {
    const verified = await this.verifyPassword(input.email, input.password, input.ip);
    await this.requireEnrollable(verified);
    const secret = newTotpSecret();
    await this.db.run({ role: 'system', userId: verified.userId }, (tx) =>
      this.repo.storePendingTotp(tx, verified.userId, encryptSecret(secret, this.totpKey)),
    );
    return {
      secret: base32Encode(secret),
      otpauth_uri: otpauthUri(secret, verified.email, brand.name),
    };
  }

  /** Second step: a correct code turns the 2FA on and signs the staff member in. */
  async confirmTotpEnrollment(input: {
    email: string;
    password: string;
    totpCode: string;
    ip: string;
  }): Promise<AuthSession> {
    const verified = await this.verifyPassword(input.email, input.password, input.ip);
    await this.requireEnrollable(verified);
    if (!verified.credential.totpSecretEnc) throw new AppError('INVALID_STATE_TRANSITION');
    await this.verifyTotpCode(verified, input.totpCode, input.ip, true);
    await this.audit.record({ action: 'auth.second_factor_enrolled', userId: verified.userId });
    return this.complete(verified, input.password, true);
  }

  // ------------------------------------------------------------------ reset and change

  /**
   * Always answers the same. For a known address the link is created and sent in the background,
   * so the time taken does not tell the two cases apart.
   */
  forgotPassword(input: { email: string; ip: string }): Promise<void> {
    const email = normalizeEmail(input.email);
    const task = this.issueResetLink(email, input.ip).catch((error: unknown) => {
      // The reason only: never the address, the token or the link.
      this.logger.error(
        `password reset link failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    });
    this.deliveries.add(task);
    void task.finally(() => this.deliveries.delete(task));
    return Promise.resolve();
  }

  /** Waits for links being issued. Tests and graceful shutdown use it. */
  async drain(): Promise<void> {
    await Promise.all([...this.deliveries]);
  }

  async resetPassword(input: { token: string; newPassword: string; ip: string }): Promise<void> {
    const now = this.clock.now();
    const ipKey = throttleKey('ip', input.ip);
    await this.refuseIfLocked([ipKey], now);

    const tokenHash = RESET_TOKEN_FORMAT.test(input.token) ? sha256(input.token) : null;
    const userId = tokenHash
      ? await this.db.run({ role: 'system' }, (tx) => this.repo.peekResetToken(tx, tokenHash, now))
      : null;
    if (!tokenHash || !userId) {
      await this.throttle.recordFailure(ipKey, IP_POLICY, now.getTime());
      throw new AppError('PASSWORD_RESET_TOKEN_INVALID');
    }

    const email = await this.db.run({ role: 'system', userId }, (tx) =>
      this.repo.emailOf(tx, userId),
    );
    this.requireStrongPassword(input.newPassword, email);
    const hashed = await this.hasher.hash(input.newPassword);

    const done = await this.db.run({ role: 'system', userId }, async (tx) => {
      // The single statement that burns the token decides who wins if two requests race.
      const owner = await this.repo.consumeResetToken(tx, tokenHash, now);
      if (owner !== userId) return false;
      await this.repo.setPassword(tx, userId, hashed, now);
      await this.repo.deleteResetTokens(tx, userId);
      return true;
    });
    if (!done) throw new AppError('PASSWORD_RESET_TOKEN_INVALID');

    await this.sessions.revokeAllSessions(userId);
    if (email) await this.throttle.reset(throttleKey('acct', normalizeEmail(email)));
    await this.audit.record({ action: 'auth.password_reset_completed', userId });
  }

  /** Signed-in change: needs the current password, ends every other session, returns a new one. */
  async changePassword(input: {
    userId: string;
    mfa: boolean;
    currentPassword: string;
    newPassword: string;
    ip: string;
  }): Promise<TokenPair> {
    const email = await this.db.run({ role: 'system', userId: input.userId }, (tx) =>
      this.repo.emailOf(tx, input.userId),
    );
    // An account with a password has an email; anything else cannot be here.
    if (!email) throw new AppError('FORBIDDEN');
    const verified = await this.verifyPassword(email, input.currentPassword, input.ip);
    if (verified.userId !== input.userId) throw new AppError('FORBIDDEN');
    this.requireStrongPassword(input.newPassword, email);

    const hashed = await this.hasher.hash(input.newPassword);
    await this.db.run({ role: 'system', userId: input.userId }, async (tx) => {
      await this.repo.setPassword(tx, input.userId, hashed, this.clock.now());
      await this.repo.deleteResetTokens(tx, input.userId);
    });
    await this.sessions.revokeAllSessions(input.userId);
    await this.audit.record({ action: 'auth.password_changed', userId: input.userId });
    return this.sessions.issue(input.userId, { mfa: input.mfa });
  }

  // ------------------------------------------------------------------ provisioning

  /** Creates or updates a login (invite flow, seeds). Applies the password policy. */
  async provision(input: {
    userId: string;
    name: string;
    email: string;
    password: string;
  }): Promise<void> {
    const email = normalizeEmail(input.email);
    this.requireStrongPassword(input.password, email);
    const hashed = await this.hasher.hash(input.password);
    await this.db.run({ role: 'system', userId: input.userId }, (tx) =>
      this.repo.upsertWithPassword(tx, {
        userId: input.userId,
        name: input.name,
        email,
        hash: hashed.hash,
        pepperVersion: hashed.pepperVersion,
      }),
    );
  }

  // ------------------------------------------------------------------ internals

  /**
   * Checks email + password under the lock-outs. Wrong and unknown look the same from outside:
   * same error, same counters, one Argon2 verification either way.
   */
  private async verifyPassword(rawEmail: string, password: string, ip: string): Promise<Verified> {
    const email = normalizeEmail(rawEmail);
    const accountKey = throttleKey('acct', email);
    const ipKey = throttleKey('ip', ip);
    const now = this.clock.now();
    await this.refuseIfLocked([accountKey, ipKey], now);

    const found = await this.db.run({ role: 'system' }, async (tx) => {
      const userId = await this.repo.userIdByEmail(tx, email);
      const credential = userId ? await this.repo.find(tx, userId) : null;
      return userId && credential ? { userId, credential } : null;
    });

    const ok = found
      ? await this.hasher.verify(
          found.credential.passwordHash,
          found.credential.pepperVersion,
          password,
        )
      : await this.hasher.verifyDummy(password);

    if (!ok || !found) {
      await this.registerFailure(
        accountKey,
        ipKey,
        found?.userId ?? null,
        'auth.login_failed',
        found ? 'bad_password' : 'unknown_account',
      );
      throw new AppError('INVALID_CREDENTIALS');
    }
    return { userId: found.userId, email, credential: found.credential };
  }

  private async verifyTotpCode(
    verified: Verified,
    code: string,
    ip: string,
    confirming: boolean,
  ): Promise<void> {
    const now = this.clock.now();
    const secretEnc = verified.credential.totpSecretEnc;
    const step = secretEnc
      ? verifyTotp(
          decryptSecret(secretEnc, this.totpKey),
          code,
          now.getTime(),
          verified.credential.totpLastStep === null
            ? null
            : Number(verified.credential.totpLastStep),
        )
      : null;
    const accepted =
      step !== null &&
      (await this.db.run({ role: 'system', userId: verified.userId }, (tx) =>
        this.repo.acceptTotpStep(tx, verified.userId, step, confirming ? now : null),
      ));
    if (!accepted) {
      await this.registerFailure(
        throttleKey('acct', verified.email),
        throttleKey('ip', ip),
        verified.userId,
        'auth.second_factor_failed',
        'bad_code',
      );
      throw new AppError('SECOND_FACTOR_INVALID');
    }
  }

  private async requireEnrollable(verified: Verified): Promise<void> {
    if (!(await this.staff.find(verified.userId))) throw new AppError('FORBIDDEN');
    if (verified.credential.totpConfirmedAt) throw new AppError('INVALID_STATE_TRANSITION');
  }

  private async complete(verified: Verified, password: string, mfa: boolean): Promise<AuthSession> {
    const { userId, credential } = verified;
    if (this.hasher.needsRehash(credential.passwordHash, credential.pepperVersion)) {
      const hashed = await this.hasher.hash(password);
      await this.db.run({ role: 'system', userId }, (tx) =>
        this.repo.setPassword(tx, userId, hashed, null),
      );
      await this.audit.record({ action: 'auth.password_rehashed', userId });
    }
    await this.throttle.reset(throttleKey('acct', verified.email));

    const user = await this.db.run({ role: 'system', userId }, (tx) =>
      tx.user.findUnique({ where: { id: userId } }),
    );
    if (!user) throw new AppError('UNAUTHENTICATED');
    const tokens = await this.sessions.issue(userId, { mfa });
    await this.audit.record({
      action: 'auth.login_succeeded',
      userId,
      reason: mfa ? 'mfa' : 'password',
    });
    return { ...tokens, user: toApiUser(user), is_new_user: false };
  }

  private async registerFailure(
    accountKey: string,
    ipKey: string,
    userId: string | null,
    action: 'auth.login_failed' | 'auth.second_factor_failed',
    reason: string,
  ): Promise<void> {
    const nowMs = this.clock.now().getTime();
    const [accountLock, ipLock] = await Promise.all([
      this.throttle.recordFailure(accountKey, ACCOUNT_POLICY, nowMs),
      this.throttle.recordFailure(ipKey, IP_POLICY, nowMs),
    ]);
    await this.audit.record({ action, userId, reason });
    if (accountLock > 0 || ipLock > 0) {
      await this.audit.record({
        action: 'auth.login_locked',
        userId,
        reason: accountLock > 0 ? 'account' : 'ip',
      });
    }
  }

  private async refuseIfLocked(keys: string[], now: Date): Promise<void> {
    const untils = await Promise.all(
      keys.map((key) => this.throttle.lockedUntil(key, now.getTime())),
    );
    const until = Math.max(0, ...untils);
    if (until > 0) {
      const wait = Math.max(1, Math.ceil((until - now.getTime()) / 1000));
      throw new AppError(
        'RATE_LIMITED',
        { retry_after_seconds: wait },
        { retryAfterSeconds: wait },
      );
    }
  }

  private requireStrongPassword(password: string, email: string | null): void {
    const problems = checkPassword(password, email ? { email } : {});
    if (problems.length > 0) throw new AppError('WEAK_PASSWORD', { problems });
  }

  private async issueResetLink(email: string, ip: string): Promise<void> {
    const now = this.clock.now();
    const keys = [throttleKey('reset-acct', email), throttleKey('reset-ip', ip)];
    // Every request counts, known address or not; past the limit nothing is sent.
    const locks = await Promise.all(
      keys.map((key) => this.throttle.recordFailure(key, RESET_REQUEST_POLICY, now.getTime())),
    );
    if (locks.some((until) => until > 0)) return;

    const target = await this.db.run({ role: 'system' }, async (tx) => {
      const userId = await this.repo.userIdByEmail(tx, email);
      return userId && (await this.repo.find(tx, userId)) ? userId : null;
    });
    if (!target) return;

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_SECONDS * 1000);
    await this.db.run({ role: 'system', userId: target }, (tx) =>
      this.repo.createResetToken(tx, { userId: target, tokenHash: sha256(token), expiresAt }),
    );
    await this.audit.record({ action: 'auth.password_reset_requested', userId: target });
    await this.sender.send({ email, token, expiresAt });
  }
}
