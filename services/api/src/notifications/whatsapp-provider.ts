export interface WhatsAppMessage {
  /** E.164 phone number. */
  to: string;
  body: string;
  /** Stable per notification; providers use it to drop duplicate sends. */
  idempotencyKey: string;
}

/** The WhatsApp channel. The real adapter (Meta Cloud API) is added once the club has an account. */
export interface WhatsAppProvider {
  send(message: WhatsAppMessage): Promise<void>;
}

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

/** Test double: records every message and can be told to fail. */
export class FakeWhatsAppProvider implements WhatsAppProvider {
  readonly sent: WhatsAppMessage[] = [];
  failNext = 0;

  send(message: WhatsAppMessage): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return Promise.reject(new Error('whatsapp provider unavailable'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }
}
