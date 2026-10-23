import { describe, expect, it } from 'vitest';

import { emptyDraft, loadDraft, saveDraft, toRequest, validateStep } from './model';

const filled = () => ({
  ...emptyDraft('2026-10-23'),
  name: 'Club Demo',
  legalName: 'Club Demo S.R.L.',
  taxId: '30000000007',
  address: 'Calle 1',
  city: 'CABA',
  ownerName: 'Dueño',
  ownerPhone: '+5491155550000',
  tariffVersionId: 'v1',
  paymentAmount: '1500,50',
  courts: [{ name: 'Cancha 1', kind: 'standard' as const, covered: true, price: '12000' }],
});

describe('onboarding model', () => {
  it('flags the fields a step still needs', () => {
    expect(validateStep('club', emptyDraft('2026-10-23'))).toContain('taxId');
    expect(validateStep('club', filled())).toEqual([]);
    expect(validateStep('club', { ...filled(), ownerPhone: '1155550000' })).toEqual(['ownerPhone']);
  });

  it('asks for deposit details only when the deposit is on', () => {
    const d = filled();
    expect(validateStep('plan', d)).toEqual([]);
    d.modules.deposit = { enabled: true, kind: 'percent', percent: null, amount_cents: null };
    expect(validateStep('plan', d)).toEqual(['deposit']);
  });

  it('sends money as integer cents and never a receipt it did not upload', () => {
    const body = toRequest(filled());
    expect(body.payment.amount_cents).toBe(150_050);
    expect(body.payment.receipt_media_id).toBeNull();
    expect(body.courts[0]?.price_cents_per_hour).toBe(1_200_000);
  });

  it('keeps and restores the draft', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    saveDraft(storage, { step: 'payment', draft: filled() });
    expect(loadDraft(storage)?.step).toBe('payment');
    expect(loadDraft({ getItem: () => '{oops' })).toBeNull();
  });
});
