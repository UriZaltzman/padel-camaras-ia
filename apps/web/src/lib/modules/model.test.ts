import { describe, expect, it } from 'vitest';

import { DEFAULT_MODULES, normalize, sameModules, validateModules, type Modules } from './model';

const base = (): Modules => structuredClone(DEFAULT_MODULES);

describe('validateModules', () => {
  it('accepts the defaults', () => {
    expect(validateModules(base())).toEqual([]);
  });
  it('asks for a percent or an amount only when the deposit is on', () => {
    const m = base();
    m.deposit = { enabled: true, kind: 'percent', percent: null, amount_cents: null };
    expect(validateModules(m)).toEqual(['depositPercent']);
    m.deposit = { enabled: true, kind: 'fixed', percent: null, amount_cents: null };
    expect(validateModules(m)).toEqual(['depositAmount']);
    m.deposit = { enabled: true, kind: 'percent', percent: 30, amount_cents: null };
    expect(validateModules(m)).toEqual([]);
  });
  it('needs two valid colors and an https logo for own branding', () => {
    const m = base();
    m.branding = { mode: 'own', logo_url: null, primary_color: null, secondary_color: null };
    expect(validateModules(m)).toEqual(['brandingColors']);
    m.branding = {
      mode: 'own',
      logo_url: 'http://x',
      primary_color: '#fff',
      secondary_color: '#000000',
    };
    expect(validateModules(m)).toEqual(['brandingColorFormat', 'brandingLogo']);
  });
});

describe('normalize', () => {
  it('drops leftovers of switched-off modules', () => {
    const m = base();
    m.deposit = { enabled: false, kind: 'fixed', percent: 20, amount_cents: 500 };
    expect(sameModules(m, base())).toBe(true);
    expect(normalize(m).deposit.amount_cents).toBeNull();
  });
});
