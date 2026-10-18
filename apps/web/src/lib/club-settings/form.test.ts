import { nth } from '@/test-utils/nth';
import { describe, expect, it } from 'vitest';

import { t } from '@/i18n';
import { demoClub } from '@/lib/api/mock-data';

import { courtToForm, toCourtSettingsUpdate, validateCourtForm, type CourtForm } from './form';
import { centsToPesosInput, pesosToCents } from './money';

const court1 = nth(demoClub.courts, 0);
const form = (): CourtForm => courtToForm(court1);
const where = (band: number) => t('courts.where.band', { court: 'Cancha 1', rule: 1, band });

describe('cents conversion', () => {
  it('parses pesos typed in es-AR style into integer cents', () => {
    expect(pesosToCents('16000')).toBe(1_600_000);
    expect(pesosToCents('16.000')).toBe(1_600_000);
    expect(pesosToCents('16.000,5')).toBe(1_600_050);
    expect(pesosToCents(' 0,10 ')).toBe(10);
  });

  it('rejects text that is not an amount', () => {
    for (const bad of ['', 'abc', '-5', '16,000.00', '1,234', '16.00']) {
      expect(pesosToCents(bad)).toBeNull();
    }
  });

  it('shows cents as pesos and back without drifting', () => {
    expect(centsToPesosInput(1_600_000)).toBe('16000');
    expect(centsToPesosInput(1_600_050)).toBe('16000,50');
    expect(pesosToCents(centsToPesosInput(123_456_789))).toBe(123_456_789);
  });
});

describe('court form', () => {
  it('round-trips the contract settings, sending money in cents', () => {
    expect(validateCourtForm(form())).toEqual([]);
    expect(toCourtSettingsUpdate(form())).toEqual({ court_id: court1.id, booking: court1.booking });
  });

  it('sends a fixed deposit in cents', () => {
    const update = toCourtSettingsUpdate({
      ...form(),
      depositType: 'fixed',
      depositPesos: '5.000',
    });
    expect(update.booking.deposit).toEqual({ type: 'fixed', amount_cents: 500_000 });
  });

  it('reports overlapping price bands', () => {
    const f = form();
    nth(nth(f.rules, 0).bands, 1).startsAt = '17:00';
    expect(validateCourtForm(f)).toContain(t('courts.error.bandOverlap', { where: where(2) }));
  });

  it('reports a gap between bands', () => {
    const f = form();
    nth(nth(f.rules, 0).bands, 1).startsAt = '19:00';
    expect(validateCourtForm(f)).toContain(t('courts.error.bandGap', { where: where(2) }));
  });

  it('reports a missing price for an allowed duration', () => {
    const f = form();
    nth(nth(f.rules, 0).bands, 0).prices[90] = '';
    expect(validateCourtForm(f)).toEqual([
      t('courts.error.priceMissing', { where: where(1), n: 90 }),
    ]);
  });

  it('reports bands that do not reach closing time', () => {
    const f = form();
    nth(nth(f.rules, 0).bands, 1).endsAt = '23:00';
    expect(validateCourtForm(f)).toContain(
      t('courts.error.bandCoverage', {
        where: t('courts.where.rule', { court: 'Cancha 1', rule: 1 }),
      }),
    );
  });

  it('reports rules that overlap on the same day', () => {
    const f = form();
    f.rules.push({ ...structuredClone(nth(f.rules, 0)), days: ['sat'] });
    expect(validateCourtForm(f)).toContain(
      t('courts.error.rulesOverlap', {
        where: t('courts.where.rule', { court: 'Cancha 1', rule: 2 }),
        other: 1,
      }),
    );
  });

  it('checks deposit and cancellation hours', () => {
    const errors = validateCourtForm({
      ...form(),
      depositPercent: '150',
      cancellationHours: '200',
    });
    expect(errors).toEqual([
      t('courts.error.percentInvalid', { court: 'Cancha 1' }),
      t('courts.error.hoursInvalid', { court: 'Cancha 1' }),
    ]);
  });
});
