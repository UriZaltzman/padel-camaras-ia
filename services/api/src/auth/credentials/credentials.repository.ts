import { Injectable } from '@nestjs/common';
import type { Tx } from '../../db/prisma.service';
import { newId } from '../../db/ids';

export interface CredentialRow {
  userId: string;
  passwordHash: string;
  pepperVersion: number;
  totpSecretEnc: string | null;
  totpConfirmedAt: Date | null;
  totpLastStep: bigint | null;
}

/** Credentials and reset tokens. Run as `system` (login, reset) or as the user (change). */
@Injectable()
export class CredentialsRepository {
  async userIdByEmail(tx: Tx, email: string): Promise<string | null> {
    const identity = await tx.authIdentity.findUnique({
      where: { provider_externalId: { provider: 'email', externalId: email } },
      select: { userId: true },
    });
    return identity?.userId ?? null;
  }

  find(tx: Tx, userId: string): Promise<CredentialRow | null> {
    return tx.userCredential.findUnique({
      where: { userId },
      select: {
        userId: true,
        passwordHash: true,
        pepperVersion: true,
        totpSecretEnc: true,
        totpConfirmedAt: true,
        totpLastStep: true,
      },
    });
  }

  async emailOf(tx: Tx, userId: string): Promise<string | null> {
    return (
      (await tx.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email ?? null
    );
  }

  async setPassword(
    tx: Tx,
    userId: string,
    hash: { hash: string; pepperVersion: number },
    changedAt: Date | null,
  ): Promise<void> {
    await tx.userCredential.update({
      where: { userId },
      data: {
        passwordHash: hash.hash,
        pepperVersion: hash.pepperVersion,
        ...(changedAt ? { passwordChangedAt: changedAt } : {}),
      },
    });
  }

  /** Creates the user (if new), the email identity and the credential. For provisioning and seeds. */
  async upsertWithPassword(
    tx: Tx,
    input: { userId: string; name: string; email: string; hash: string; pepperVersion: number },
  ): Promise<void> {
    await tx.user.upsert({
      where: { id: input.userId },
      create: { id: input.userId, name: input.name, email: input.email },
      update: { email: input.email },
    });
    await tx.authIdentity.upsert({
      where: { provider_externalId: { provider: 'email', externalId: input.email } },
      create: { id: newId(), userId: input.userId, provider: 'email', externalId: input.email },
      update: {},
    });
    await tx.userCredential.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        passwordHash: input.hash,
        pepperVersion: input.pepperVersion,
      },
      update: { passwordHash: input.hash, pepperVersion: input.pepperVersion },
    });
  }

  async storePendingTotp(tx: Tx, userId: string, secretEnc: string): Promise<void> {
    await tx.userCredential.update({
      where: { userId },
      data: { totpSecretEnc: secretEnc, totpConfirmedAt: null, totpLastStep: null },
    });
  }

  /** Marks a code step as used. False if that step (or a later one) was already accepted. */
  async acceptTotpStep(
    tx: Tx,
    userId: string,
    step: number,
    confirm: Date | null,
  ): Promise<boolean> {
    const result = await tx.userCredential.updateMany({
      where: {
        userId,
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: BigInt(step) } }],
      },
      data: { totpLastStep: BigInt(step), ...(confirm ? { totpConfirmedAt: confirm } : {}) },
    });
    return result.count === 1;
  }

  async createResetToken(
    tx: Tx,
    input: { userId: string; tokenHash: string; expiresAt: Date },
  ): Promise<void> {
    // One live link per account: asking again replaces the earlier one.
    await tx.passwordResetToken.deleteMany({ where: { userId: input.userId } });
    await tx.passwordResetToken.create({ data: { id: newId(), ...input } });
  }

  /** Burns the token in one statement: only one caller can ever get the user id back. */
  /** The user a live (unused, unexpired) token belongs to, without burning it. */
  async peekResetToken(tx: Tx, tokenHash: string, now: Date): Promise<string | null> {
    const row = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { userId: true, usedAt: true, expiresAt: true },
    });
    return row && row.usedAt === null && row.expiresAt > now ? row.userId : null;
  }

  async consumeResetToken(tx: Tx, tokenHash: string, now: Date): Promise<string | null> {
    const rows = await tx.$queryRaw<{ user_id: string }[]>`
      UPDATE password_reset_tokens SET used_at = ${now}
       WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > ${now}
      RETURNING user_id`;
    return rows[0]?.user_id ?? null;
  }

  async deleteResetTokens(tx: Tx, userId: string): Promise<void> {
    await tx.passwordResetToken.deleteMany({ where: { userId } });
  }
}
