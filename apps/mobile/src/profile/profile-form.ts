// Profile form: Zod validation mirroring UserUpdate in the contract, and mapping of API error
// codes to i18n keys. Messages are i18n keys, never texts.
import { z } from 'zod';

import type { Schema } from '@app/contracts';

/** From 8va (`8`) to 1ra (`1`), in the order a player reads them. */
export const CATEGORIES = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;
export const HANDS = ['right', 'left'] as const;
export const SIDES = ['drive', 'reves', 'both'] as const;

export const profileFormSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, { error: 'profile.errors.nameRequired' })
    .max(80, { error: 'profile.errors.nameTooLong' }),
  declared_category: z.enum(CATEGORIES).nullable(),
  dominant_hand: z.enum(HANDS).nullable(),
  playing_side: z.enum(SIDES).nullable(),
  training_opt_out: z.boolean(),
});

export type ProfileForm = z.input<typeof profileFormSchema>;
type FieldErrors = Partial<Record<keyof ProfileForm, string>>;

export function formFromUser(user: Schema<'User'>): ProfileForm {
  return {
    display_name: user.display_name,
    declared_category: user.declared_category ?? null,
    dominant_hand: user.dominant_hand ?? null,
    playing_side: user.playing_side ?? null,
    training_opt_out: user.training_opt_out,
  };
}

export type ValidationResult =
  { ok: true; body: Schema<'UserUpdate'> } | { ok: false; errors: FieldErrors };

export function validateProfile(form: ProfileForm): ValidationResult {
  const parsed = profileFormSchema.safeParse(form);
  if (parsed.success) return { ok: true, body: parsed.data };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof ProfileForm;
    errors[field] ??= issue.message.startsWith('profile.')
      ? issue.message
      : 'profile.errors.generic';
  }
  return { ok: false, errors };
}

const KNOWN_CODES: readonly string[] = ['VALIDATION_FAILED', 'RATE_LIMITED', 'UNAUTHENTICATED'];

/** Error answered by the API, carrying its contract code. */
export class ProfileApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** i18n key for an API or network error. */
export function errorKey(err: unknown): string {
  if (err instanceof ProfileApiError) {
    return KNOWN_CODES.includes(err.code) ? `profile.errors.${err.code}` : 'profile.errors.generic';
  }
  return 'profile.errors.network';
}

/** The deletion date as the player reads it: Buenos Aires time, es-AR. */
export function formatDeletionDate(iso: string, locale = 'es-AR'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(iso));
}
