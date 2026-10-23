import { Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AuthModule } from '../auth/auth.module';
import { REDIS } from '../redis/redis.module';
import { CHECKOUT_STORE, RedisCheckoutStore } from './checkout-store';
import { CheckoutService } from './checkout.service';
import { PAYMENT_EVENTS, RecordingPaymentEvents } from './payment-events';
import { PAYMENT_PROVIDER, UnconfiguredPaymentProvider } from './payment-provider';
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
    { provide: PAYMENT_PROVIDER, useClass: UnconfiguredPaymentProvider },
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
