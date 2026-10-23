import { z } from 'zod';

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** `AdminModules` of the contract (SA-05). */
export const clubModulesSchema = z
  .object({
    deposit: z
      .object({
        enabled: z.boolean(),
        kind: z.enum(['percent', 'fixed']),
        percent: z.number().int().min(1).max(100).nullable(),
        amount_cents: z.number().int().min(1).nullable(),
      })
      .strict(),
    branding: z
      .object({
        mode: z.enum(['own', 'generic']),
        logo_url: z.url().nullable(),
        primary_color: color.nullable(),
        secondary_color: color.nullable(),
      })
      .strict(),
    lesson_mode: z.enum(['app', 'whatsapp']),
    ai_video: z.enum(['off', 'club_pays', 'player_pays']),
    tournaments: z.boolean(),
  })
  .strict();

export type ClubModules = z.infer<typeof clubModulesSchema>;

/** `PUT /admin/clubs/{id}/modules` body. */
export const clubModulesUpdateSchema = z.object({ modules: clubModulesSchema }).strict();

/** A club with no row yet: nothing optional is on. */
export const DEFAULT_MODULES: ClubModules = {
  deposit: { enabled: false, kind: 'percent', percent: null, amount_cents: null },
  branding: { mode: 'generic', logo_url: null, primary_color: null, secondary_color: null },
  lesson_mode: 'app',
  ai_video: 'off',
  tournaments: false,
};

/** Modules whose endpoints a club can lose. */
export type ModuleName = 'deposit' | 'branding' | 'lessons_in_app' | 'ai_video' | 'tournaments';

export function isModuleOn(modules: ClubModules, name: ModuleName): boolean {
  switch (name) {
    case 'deposit':
      return modules.deposit.enabled;
    case 'branding':
      return modules.branding.mode === 'own';
    case 'lessons_in_app':
      return modules.lesson_mode === 'app';
    case 'ai_video':
      return modules.ai_video !== 'off';
    case 'tournaments':
      return modules.tournaments;
  }
}

interface Issue {
  path: string;
  rule: string;
}

/** What a schema cannot say: a kind needs its own value. */
export function findModuleIssues(modules: ClubModules): Issue[] {
  const issues: Issue[] = [];
  const { deposit, branding } = modules;
  if (deposit.enabled) {
    if (deposit.kind === 'percent' && deposit.percent === null) {
      issues.push({ path: '/modules/deposit/percent', rule: 'required' });
    }
    if (deposit.kind === 'fixed' && deposit.amount_cents === null) {
      issues.push({ path: '/modules/deposit/amount_cents', rule: 'required' });
    }
  }
  if (branding.mode === 'own') {
    if (branding.logo_url === null)
      issues.push({ path: '/modules/branding/logo_url', rule: 'required' });
    if (branding.primary_color === null) {
      issues.push({ path: '/modules/branding/primary_color', rule: 'required' });
    }
    if (branding.secondary_color === null) {
      issues.push({ path: '/modules/branding/secondary_color', rule: 'required' });
    }
  }
  return issues;
}
