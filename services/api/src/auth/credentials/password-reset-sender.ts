import type { Logger } from 'pino';

export interface PasswordResetMessage {
  email: string;
  /** The secret part of the link. Only the sender ever sees it; the database keeps its hash. */
  token: string;
  expiresAt: Date;
}

/** Delivers the reset link by email. The real adapter arrives with the email provider account. */
export interface PasswordResetSender {
  send(message: PasswordResetMessage): Promise<void>;
}

export const PASSWORD_RESET_SENDER = Symbol('PASSWORD_RESET_SENDER');

/** Test double: keeps what would have been emailed. */
export class FakePasswordResetSender implements PasswordResetSender {
  readonly sent: PasswordResetMessage[] = [];
  failNext = 0;

  send(message: PasswordResetMessage): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return Promise.reject(new Error('email provider unavailable'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }
}

/** Development only: prints the link so a person can follow it. Never used in production. */
export class ConsolePasswordResetSender implements PasswordResetSender {
  constructor(
    private readonly logger: Logger,
    private readonly baseUrl: string,
  ) {}

  send(message: PasswordResetMessage): Promise<void> {
    const link = `${this.baseUrl}?token=${message.token}`;
    this.logger.info({ link }, 'password reset link (not sent: dev)');
    return Promise.resolve();
  }
}

/** Production until a person creates the email provider account and adds the real adapter. */
export class UnconfiguredPasswordResetSender implements PasswordResetSender {
  send(): Promise<void> {
    return Promise.reject(new Error('Password reset email provider is not configured'));
  }
}
