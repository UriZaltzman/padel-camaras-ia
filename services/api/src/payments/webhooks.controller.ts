import { Controller, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { WebhookService } from './webhook.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhook: WebhookService) {}

  /** Called by Mercado Pago: no bearer token, authenticated by `x-signature`. */
  @Post('mercadopago')
  @HttpCode(200)
  async receive(
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Query('data.id') dataId: string | undefined,
    @Query('type') type: string | undefined,
  ): Promise<Record<string, never>> {
    await this.webhook.handle({ signatureHeader: signature, requestId, dataId, type });
    return {};
  }
}
