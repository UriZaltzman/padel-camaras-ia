import type { Schema } from '@app/contracts';

import { simulateInvoice } from '@/lib/tariffs/model';

type Modules = Schema<'AdminModules'>;

export const STEPS = ['club', 'plan', 'payment', 'setup', 'delivery'] as const;
export type Step = (typeof STEPS)[number];

export interface CourtDraft {
  name: string;
  kind: 'standard' | 'panoramic';
  covered: boolean;
  /** Whole pesos, as typed; converted to cents when sent. */
  price: string;
}

export interface OnboardingDraft {
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  city: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  plan: Schema<'ClubPlan'>;
  tariffVersionId: string;
  /** Active players the seller expects; only used for the live price. */
  expectedPlayers: number;
  modules: Modules;
  paymentAmount: string;
  paymentMethod: Schema<'AdminPaymentMethod'>;
  paidOn: string;
  paymentReference: string;
  /** Name of the receipt photo taken on site; the file itself is not uploaded yet. */
  receiptPhotoName: string;
  courts: CourtDraft[];
}

export const EMPTY_MODULES: Modules = {
  deposit: { enabled: false, kind: 'percent', percent: null, amount_cents: null },
  branding: { mode: 'generic', logo_url: null, primary_color: null, secondary_color: null },
  lesson_mode: 'app',
  ai_video: 'club_pays',
  tournaments: false,
};

export function emptyDraft(today: string): OnboardingDraft {
  return {
    name: '',
    legalName: '',
    taxId: '',
    address: '',
    city: '',
    ownerName: '',
    ownerPhone: '',
    ownerEmail: '',
    plan: 'loan',
    tariffVersionId: '',
    expectedPlayers: 100,
    modules: structuredClone(EMPTY_MODULES),
    paymentAmount: '',
    paymentMethod: 'transfer',
    paidOn: today,
    paymentReference: '',
    receiptPhotoName: '',
    courts: [{ name: 'Cancha 1', kind: 'panoramic', covered: false, price: '' }],
  };
}

export const pesosToCents = (raw: string): number =>
  Math.round(Number(raw.replace(',', '.')) * 100);

export type ErrorKey =
  | 'name'
  | 'legalName'
  | 'taxId'
  | 'address'
  | 'city'
  | 'ownerName'
  | 'ownerPhone'
  | 'ownerEmail'
  | 'tariff'
  | 'deposit'
  | 'colors'
  | 'amount'
  | 'paidOn'
  | 'courts';

const PHONE = /^\+[1-9]\d{7,14}$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Field problems of one step (same limits as the contract). Empty when the step can go on. */
export function validateStep(step: Step, d: OnboardingDraft): ErrorKey[] {
  const bad: ErrorKey[] = [];
  const need = (key: ErrorKey, ok: boolean) => ok || bad.push(key);
  if (step === 'club') {
    need('name', d.name.trim().length > 0);
    need('legalName', d.legalName.trim().length > 0);
    need('taxId', /^\d{11}$/.test(d.taxId));
    need('address', d.address.trim().length > 0);
    need('city', d.city.trim().length > 0);
    need('ownerName', d.ownerName.trim().length > 0);
    need('ownerPhone', PHONE.test(d.ownerPhone));
    need('ownerEmail', d.ownerEmail === '' || /^\S+@\S+\.\S+$/.test(d.ownerEmail));
  }
  if (step === 'plan') {
    need('tariff', d.tariffVersionId !== '');
    const dep = d.modules.deposit;
    need(
      'deposit',
      !dep.enabled ||
        (dep.kind === 'percent'
          ? (dep.percent ?? 0) >= 1 && (dep.percent ?? 0) <= 100
          : (dep.amount_cents ?? 0) > 0),
    );
  }
  if (step === 'payment') {
    need('amount', pesosToCents(d.paymentAmount) > 0);
    need('paidOn', /^\d{4}-\d{2}-\d{2}$/.test(d.paidOn));
  }
  if (step === 'setup') {
    need(
      'courts',
      d.courts.length > 0 &&
        d.courts.every(
          (c) => c.name.trim() !== '' && pesosToCents(c.price || '0') >= 0 && c.price !== '',
        ),
    );
    const b = d.modules.branding;
    need(
      'colors',
      b.mode === 'generic' ||
        (COLOR.test(b.primary_color ?? '') && COLOR.test(b.secondary_color ?? '')),
    );
  }
  return bad;
}

/** Monthly price the club will pay: tier of the expected players plus enabled modules. */
export function monthlyPrice(
  version: Schema<'AdminTariffVersion'> | undefined,
  d: OnboardingDraft,
): Schema<'AdminInvoiceSimulation'> | null {
  return version ? simulateInvoice(version, d.expectedPlayers, d.modules) : null;
}

export function toRequest(d: OnboardingDraft): Schema<'AdminClubOnboarding'> {
  return {
    name: d.name.trim(),
    legal: {
      legal_name: d.legalName.trim(),
      tax_id: d.taxId,
      contact_name: d.ownerName.trim(),
      contact_phone: d.ownerPhone,
      contact_email: d.ownerEmail,
      address: d.address.trim(),
      city: d.city.trim(),
    },
    owner: {
      name: d.ownerName.trim(),
      phone: d.ownerPhone,
      ...(d.ownerEmail ? { email: d.ownerEmail } : {}),
    },
    plan: d.plan,
    tariff_version_id: d.tariffVersionId,
    modules: d.modules,
    payment: {
      amount_cents: pesosToCents(d.paymentAmount),
      method: d.paymentMethod,
      paid_on: d.paidOn,
      ...(d.paymentReference ? { reference: d.paymentReference } : {}),
      receipt_media_id: null,
    },
    courts: d.courts.map((c) => ({
      name: c.name.trim(),
      kind: c.kind,
      covered: c.covered,
      price_cents_per_hour: pesosToCents(c.price),
    })),
  };
}

const DRAFT_KEY = 'console.onboarding.draft';
interface Saved {
  step: Step;
  draft: OnboardingDraft;
}

/** Draft kept in this browser at every step, so a dropped connection on site loses nothing. */
export function loadDraft(storage: Pick<Storage, 'getItem'>): Saved | null {
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    return STEPS.includes(saved.step) && saved.draft ? saved : null;
  } catch {
    return null;
  }
}

export function saveDraft(storage: Pick<Storage, 'setItem'>, saved: Saved): void {
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(saved));
  } catch {
    // Private mode or full storage: the wizard still works, just without a draft.
  }
}

export function clearDraft(storage: Pick<Storage, 'removeItem'>): void {
  try {
    storage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clean.
  }
}
