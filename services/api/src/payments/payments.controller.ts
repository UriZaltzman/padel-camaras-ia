import { Body, Controller, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard, Auth } from '../auth/access-token.guard';
import type { AccessIdentity } from '../auth/session/session.service';
import { CheckoutService } from './checkout.service';
import type { Checkout } from './payments.model';

@Controller()
export class PaymentsController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('payments/checkout')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  createCheckout(
    @Auth() auth: AccessIdentity,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ): Promise<Checkout> {
    return this.checkout.create(auth.userId, idempotencyKey, body);
  }
}
