import { Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AuthModule } from '../auth/auth.module';
import { REDIS } from '../redis/redis.module';
import { CHECKOUT_STORE, RedisCheckoutStore } from './checkout-store';
import { CheckoutService } from './checkout.service';
import { PAYMENT_EVENTS, RecordingPaymentEvents } from './payment-events';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env';
import {
  PAYMENT_PROVIDER,
  SelfApprovingPaymentProvider,
  UnconfiguredPaymentProvider,
} from './payment-provider';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PrismaPaymentsRepository } from './prisma-payments.repository';
import { WebhookService } from './webhook.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [
    CheckoutService,
    WebhookService,
    { provide: PaymentsRepository, useClass: PrismaPaymentsRepository },
    // Bound to the real Mercado Pago client once the application and its keys exist.
    // `PAYMENT_PROVIDER=fake` (refused in production by the env schema) is for the e2e stack.
    {
      provide: PAYMENT_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.PAYMENT_PROVIDER === 'fake'
          ? new SelfApprovingPaymentProvider()
          : new UnconfiguredPaymentProvider(),
    },
    // Swapped for the EventBus adapter when the events module is wired into the app.
    { provide: PAYMENT_EVENTS, useClass: RecordingPaymentEvents },
    {
      provide: CHECKOUT_STORE,
      inject: [REDIS],
      useFactory: (redis: Redis) => new RedisCheckoutStore(redis),
    },
  ],
  exports: [PaymentsRepository, PAYMENT_PROVIDER, PAYMENT_EVENTS],
})
export class PaymentsModule {}
