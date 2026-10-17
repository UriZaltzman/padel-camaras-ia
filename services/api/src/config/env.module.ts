import { Global, Module, type DynamicModule } from '@nestjs/common';
import type { Env } from './env';

/** Injection token for the validated environment: `@Inject(ENV) env: Env`. */
export const ENV = Symbol('ENV');

@Global()
@Module({})
export class EnvModule {
  static register(env: Env): DynamicModule {
    return {
      module: EnvModule,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
