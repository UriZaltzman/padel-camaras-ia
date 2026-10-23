import type { Schema } from '@app/contracts';

export type Modules = Schema<'AdminModules'>;

/** What a club gets when no module is switched on: the "restore defaults" target. */
export const DEFAULT_MODULES: Modules = {
  deposit: { enabled: false, kind: 'percent', percent: null, amount_cents: null },
  branding: { mode: 'generic', logo_url: null, primary_color: null, secondary_color: null },
  lesson_mode: 'whatsapp',
  ai_video: 'off',
  tournaments: false,
};

export type ModulesProblem =
  'depositPercent' | 'depositAmount' | 'brandingColors' | 'brandingLogo' | 'brandingColorFormat';

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Same rules the API enforces (`VALIDATION_FAILED`), so the form can say what is wrong early. */
export function validateModules(m: Modules): ModulesProblem[] {
  const problems: ModulesProblem[] = [];
  if (m.deposit.enabled) {
    if (
      m.deposit.kind === 'percent' &&
      !(m.deposit.percent && m.deposit.percent >= 1 && m.deposit.percent <= 100)
    ) {
      problems.push('depositPercent');
    }
    if (m.deposit.kind === 'fixed' && !(m.deposit.amount_cents && m.deposit.amount_cents > 0)) {
      problems.push('depositAmount');
    }
  }
  if (m.branding.mode === 'own') {
    const { primary_color: p, secondary_color: s, logo_url: logo } = m.branding;
    if (!p || !s) problems.push('brandingColors');
    else if (!HEX.test(p) || !HEX.test(s)) problems.push('brandingColorFormat');
    if (logo && !/^https:\/\/\S+$/.test(logo)) problems.push('brandingLogo');
  }
  return problems;
}

/** Generic branding carries no logo or colors; keeps the payload canonical. */
export function normalize(m: Modules): Modules {
  const deposit = m.deposit.enabled
    ? {
        enabled: true,
        kind: m.deposit.kind,
        percent: m.deposit.kind === 'percent' ? m.deposit.percent : null,
        amount_cents: m.deposit.kind === 'fixed' ? m.deposit.amount_cents : null,
      }
    : DEFAULT_MODULES.deposit;
  const branding = m.branding.mode === 'own' ? m.branding : DEFAULT_MODULES.branding;
  return { ...m, deposit, branding };
}

export const sameModules = (a: Modules, b: Modules) =>
  JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
