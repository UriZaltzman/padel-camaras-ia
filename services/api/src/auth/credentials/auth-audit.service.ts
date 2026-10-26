import { Injectable } from '@nestjs/common';
import { newId } from '../../db/ids';
import { PrismaService } from '../../db/prisma.service';
import { currentLogContext } from '../../logging/request-context';

export type AuthAuditAction =
  | 'auth.login_succeeded'
  | 'auth.login_failed'
  | 'auth.login_locked'
  | 'auth.second_factor_failed'
  | 'auth.second_factor_enrolled'
  | 'auth.password_reset_requested'
  | 'auth.password_reset_completed'
  | 'auth.password_changed'
  | 'auth.password_rehashed';

/**
 * Audit trail of sign-in events (`audit_log`). Entries hold ids and a reason code, never the email
 * typed, a password, a code or a token. A failure against an address with no account is recorded
 * too (no user to point at), so the log shows probing without revealing who exists.
 */
@Injectable()
export class AuthAuditService {
  constructor(private readonly db: PrismaService) {}

  async record(entry: {
    action: AuthAuditAction;
    userId?: string | null;
    reason?: string;
  }): Promise<void> {
    await this.db.run({ role: 'system', userId: entry.userId ?? undefined }, (tx) =>
      // `createMany` does not ask for the row back: nobody but a club owner may read audit rows,
      // and an INSERT ... RETURNING is checked against the read policy too.
      tx.auditLog.createMany({
        data: [
          {
            id: newId(),
            actorUserId: entry.userId ?? null,
            action: entry.action,
            entityType: entry.userId ? 'user' : 'login',
            entityId: entry.userId ?? null,
            reason: entry.reason ?? null,
            requestId: currentLogContext()?.request_id ?? null,
          },
        ],
      }),
    );
  }
}
