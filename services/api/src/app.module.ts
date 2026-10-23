import { Module, type DynamicModule } from '@nestjs/common';
import type { Env } from './config/env';
import { EnvModule } from './config/env.module';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { ClubModulesModule } from './club-modules/club-modules.module';
import { ClubsModule } from './clubs/clubs.module';
import { CrmModule } from './crm/crm.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { PaymentsModule } from './payments/payments.module';
import { RedisModule } from './redis/redis.module';

@Module({})
export class AppModule {
  static register(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        EnvModule.register(env),
        DbModule,
        RedisModule,
        AuthModule,
        ClubsModule,
        ClubModulesModule,
        BookingsModule,
        CrmModule,
        PaymentsModule,
        HealthModule,
      ],
    };
  }
}
