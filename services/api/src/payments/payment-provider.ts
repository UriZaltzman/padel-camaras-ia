import { AppError } from '../errors/app-error';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type ProviderPaymentStatus = 'pending' | 'approved' | 'rejected' | 'refunded';

export interface PreferenceRequest {
  /** Echoed back by the provider; `<club_id>:<payment_id>` so the webhook finds our row. */
  externalReference: string;
  title: string;
  amountCents: number;
  marketplaceFeeCents: number;
  /** Mercado Pago account of the club that receives the money; null = we collect. */
  collectorId: string | null;
  expiresAt: Date | null;
}

export interface Preference {
  preferenceId: string;
  checkoutUrl: string;
}

export interface ProviderPayment {
  providerPaymentId: string;
  status: ProviderPaymentStatus;
  amountCents: number;
  externalReference: string | null;
}

/** The Mercado Pago API as the API needs it. Real keys are bound outside the repo. */
export interface PaymentProvider {
  createPreference(request: PreferenceRequest): Promise<Preference>;
  /** Reads the payment back from the provider: the notification body is never trusted. */
  getPayment(providerPaymentId: string): Promise<ProviderPayment>;
  refund(providerPaymentId: string): Promise<void>;
}

/** Production binding until a person creates the Mercado Pago application and stores its keys. */
export class UnconfiguredPaymentProvider implements PaymentProvider {
  createPreference(): Promise<Preference> {
    return Promise.reject(new AppError('PAYMENT_PROVIDER_ERROR', { reason: 'not_configured' }));
  }
  getPayment(): Promise<ProviderPayment> {
    return Promise.reject(new AppError('PAYMENT_PROVIDER_ERROR', { reason: 'not_configured' }));
  }
  refund(): Promise<void> {
    return Promise.reject(new AppError('PAYMENT_PROVIDER_ERROR', { reason: 'not_configured' }));
  }
}

/** Test double that behaves like the provider; tests drive payments through `setStatus`. */
export class FakePaymentProvider implements PaymentProvider {
  readonly preferences: PreferenceRequest[] = [];
  readonly refunds: string[] = [];
  private readonly payments = new Map<string, ProviderPayment>();
  private counter = 0;

  createPreference(request: PreferenceRequest): Promise<Preference> {
    this.preferences.push(request);
    this.counter += 1;
    return Promise.resolve({
      preferenceId: `pref-${this.counter}`,
      checkoutUrl: `https://fake.mercadopago.test/checkout?pref_id=pref-${this.counter}`,
    });
  }

  /** Registers (or changes) a provider-side payment for the preference's reference. */
  setStatus(
    providerPaymentId: string,
    externalReference: string,
    amountCents: number,
    status: ProviderPaymentStatus,
  ): void {
    this.payments.set(providerPaymentId, {
      providerPaymentId,
      status,
      amountCents,
      externalReference,
    });
  }

  getPayment(providerPaymentId: string): Promise<ProviderPayment> {
    const found = this.payments.get(providerPaymentId);
    return found
      ? Promise.resolve(found)
      : Promise.reject(new AppError('PAYMENT_PROVIDER_ERROR', { reason: 'unknown_payment' }));
  }

  refund(providerPaymentId: string): Promise<void> {
    this.refunds.push(providerPaymentId);
    const found = this.payments.get(providerPaymentId);
    if (found) this.payments.set(providerPaymentId, { ...found, status: 'refunded' });
    return Promise.resolve();
  }
}

/**
 * Stand-in for Mercado Pago in the full-stack e2e environment (`PAYMENT_PROVIDER=fake`, never in
 * production). Every preference it creates is paid in full as soon as the provider is asked
 * about it, so a test only has to send the signed webhook with the preference id.
 */
export class SelfApprovingPaymentProvider implements PaymentProvider {
  private readonly preferences = new Map<string, PreferenceRequest>();
  private readonly refunded = new Set<string>();

  createPreference(request: PreferenceRequest): Promise<Preference> {
    const preferenceId = `fake-${request.externalReference.split(':')[1] ?? 'pref'}`;
    this.preferences.set(preferenceId, request);
    return Promise.resolve({
      preferenceId,
      checkoutUrl: `https://fake.mercadopago.test/checkout?pref_id=${preferenceId}`,
    });
  }

  getPayment(providerPaymentId: string): Promise<ProviderPayment> {
    const request = this.preferences.get(providerPaymentId);
    if (!request) {
      return Promise.reject(new AppError('PAYMENT_PROVIDER_ERROR', { reason: 'unknown_payment' }));
    }
    return Promise.resolve({
      providerPaymentId,
      status: this.refunded.has(providerPaymentId) ? 'refunded' : 'approved',
      amountCents: request.amountCents,
      externalReference: request.externalReference,
    });
  }

  refund(providerPaymentId: string): Promise<void> {
    this.refunded.add(providerPaymentId);
    return Promise.resolve();
  }
}
