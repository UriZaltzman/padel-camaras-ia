import type { Logger } from 'pino';
import type { WhatsAppMessage, WhatsAppProvider } from './whatsapp-provider';

/** Development: prints the message instead of sending it, so a code can be read from the log. */
export class ConsoleWhatsAppProvider implements WhatsAppProvider {
  constructor(private readonly logger: Logger) {}

  send(message: WhatsAppMessage): Promise<void> {
    this.logger.info({ to: message.to, body: message.body }, 'whatsapp message (not sent: dev)');
    return Promise.resolve();
  }
}

/** Production until a person creates the WhatsApp Business account and adds the real adapter. */
export class UnconfiguredWhatsAppProvider implements WhatsAppProvider {
  send(): Promise<void> {
    return Promise.reject(new Error('WhatsApp provider is not configured'));
  }
}
