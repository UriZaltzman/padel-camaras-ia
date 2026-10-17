import { Module, type DynamicModule } from '@nestjs/common';
import type { Env } from './config/env';
import { EnvModule } from './config/env.module';
import { HealthModule } from './health/health.module';

@Module({})
export class AppModule {
  static register(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [EnvModule.register(env), HealthModule],
    };
  }
}
