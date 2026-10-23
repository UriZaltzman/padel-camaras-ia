import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock';
import { newId } from '../db/ids';
import { PrismaService } from '../db/prisma.service';
import { AppError } from '../errors/app-error';
import { authMessage } from '../i18n/messages';
import { OtpService } from './otp/otp.service';
import { SessionService, type TokenPair } from './session/session.service';
import { AuthUsersRepository } from './users/auth-users.repository';
import { toApiUser, type ApiUser } from './users/user-mapper';

export interface SignUpConsent {
  terms_version: string;
  privacy_version: string;
}

export interface AuthSession extends TokenPair {
  user: ApiUser;
  is_new_user: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly users: AuthUsersRepository,
    private readonly db: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Signs in with a WhatsApp code. A phone with no account gets one, and then the consent is
   * required: without it the answer is `TERMS_NOT_ACCEPTED` and the code is still valid.
   */
  async verifyWhatsappOtp(
    phone: string,
    code: string,
    consent: SignUpConsent | undefined,
  ): Promise<AuthSession> {
    let existingUserId: string | null = null;
    await this.otp.verify(phone, code, async () => {
      // Identities of any user are readable only by the `system` role, before a user is known.
      existingUserId = await this.db.run({ role: 'system' }, (tx) =>
        this.users.findUserIdByIdentity(tx, 'whatsapp', phone),
      );
      if (existingUserId === null && consent === undefined) {
        throw new AppError('TERMS_NOT_ACCEPTED');
      }
    });

    const isNew = existingUserId === null;
    const userId = existingUserId ?? newId();
    const user = await this.db.run({ role: 'system', userId }, async (tx) => {
      if (isNew && consent) {
        return this.users.createWithWhatsapp(tx, {
          id: userId,
          name: authMessage('default_player_name'),
          phone,
          termsVersion: consent.terms_version,
          privacyVersion: consent.privacy_version,
          acceptedAt: this.clock.now(),
        });
      }
      const found = await this.users.findById(tx, userId);
      if (!found) throw new AppError('UNAUTHENTICATED');
      return found;
    });

    const tokens = await this.sessions.issue(user.id);
    return { ...tokens, user: toApiUser(user), is_new_user: isNew };
  }
}
