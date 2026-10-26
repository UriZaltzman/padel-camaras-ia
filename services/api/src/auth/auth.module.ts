import { Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CLOCK, systemClock } from '../common/clock';
import type { Env } from '../config/env';
import { ENV } from '../config/env.module';
import { createLogger } from '../logging/logger';
import {
  ConsoleWhatsAppProvider,
  UnconfiguredWhatsAppProvider,
} from '../notifications/dev-whatsapp-providers';
import { WHATSAPP_PROVIDER } from '../notifications/whatsapp-provider';
import { REDIS } from '../redis/redis.module';
import { EnvStaffDirectory, StaffDirectory } from '../admin/staff-directory';
import { AuthAuditService } from './credentials/auth-audit.service';
import { CredentialsController } from './credentials/credentials.controller';
import { CredentialsRepository } from './credentials/credentials.repository';
import { CredentialsService } from './credentials/credentials.service';
import { LOGIN_THROTTLE, RedisLoginThrottleStore } from './credentials/login-throttle';
import { PasswordHasher } from './credentials/password-hasher';
import {
  ConsolePasswordResetSender,
  PASSWORD_RESET_SENDER,
  UnconfiguredPasswordResetSender,
} from './credentials/password-reset-sender';
import { AccessTokenGuard } from './access-token.guard';
import { AuthController } from './auth.controller';
import { OTP_STORE } from './otp/otp-store';
import { OtpService } from './otp/otp.service';
import { AuthService } from './auth.service';
import { JwtSigner } from './session/jwt';
import { RedisSessionStore } from './session/redis-session-store';
import { SESSION_STORE } from './session/session-store';
import { JWT_SIGNER, SessionService } from './session/session.service';
import { AuthUsersRepository } from './users/auth-users.repository';
import { RedisOtpStore } from './otp/redis-otp-store';

@Module({
  controllers: [AuthController, CredentialsController],
  providers: [
    OtpService,
    AuthService,
    CredentialsService,
    CredentialsRepository,
    { provide: StaffDirectory, useClass: EnvStaffDirectory },
    PasswordHasher,
    AuthAuditService,
    {
      provide: LOGIN_THROTTLE,
      inject: [REDIS],
      useFactory: (redis: Redis) => new RedisLoginThrottleStore(redis),
    },
    {
      provide: PASSWORD_RESET_SENDER,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.NODE_ENV === 'production'
          ? new UnconfiguredPasswordResetSender()
          : new ConsolePasswordResetSender(
              createLogger(env).child({ context: 'PasswordReset' }),
              env.PASSWORD_RESET_URL,
            ),
    },
    SessionService,
    AuthUsersRepository,
    AccessTokenGuard,
    {
      provide: SESSION_STORE,
      inject: [REDIS],
      useFactory: (redis: Redis) => new RedisSessionStore(redis),
    },
    {
      provide: JWT_SIGNER,
      inject: [ENV],
      useFactory: (env: Env) => new JwtSigner(env.AUTH_JWT_PRIVATE_KEY),
    },
    { provide: CLOCK, useValue: systemClock },
    { provide: OTP_STORE, inject: [REDIS], useFactory: (redis: Redis) => new RedisOtpStore(redis) },
    {
      provide: WHATSAPP_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.NODE_ENV === 'production'
          ? new UnconfiguredWhatsAppProvider()
          : new ConsoleWhatsAppProvider(createLogger(env).child({ context: 'WhatsApp' })),
    },
  ],
  exports: [SessionService, AccessTokenGuard, CLOCK],
})
export class AuthModule {}
