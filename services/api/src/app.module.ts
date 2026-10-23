import { Module, type DynamicModule } from '@nestjs/common';
import type { Env } from './config/env';
import { EnvModule } from './config/env.module';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { ClubsModule } from './clubs/clubs.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
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
        BookingsModule,
        HealthModule,
      ],
    };
  }
}
