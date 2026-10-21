import type { Schema } from '@app/contracts';
import { z } from 'zod';

import type { MessageKey } from '@/i18n';

import { toE164 } from './phone';

export type SignInState =
  | { step: 'phone'; error?: MessageKey }
  | { step: 'code'; phone: string; needsConsent: boolean; code?: string; error?: MessageKey };

export const initialSignInState: SignInState = { step: 'phone' };

export type FormState = { status: 'idle' | 'saved' } | { status: 'error'; error: MessageKey };
export const initialFormState: FormState = { status: 'idle' };

export type InviteState = { status: 'idle' } | { status: 'ready'; url: string } | FormState;

/** Message shown for an API error code. Unknown codes get the generic message. */
export function errorMessage(code: Schema<'ErrorCode'> | undefined): MessageKey {
  switch (code) {
    case 'OTP_INVALID':
      return 'player.error.otpInvalid';
    case 'OTP_EXPIRED':
      return 'player.error.otpExpired';
    case 'OTP_ATTEMPTS_EXCEEDED':
      return 'player.error.otpAttempts';
    case 'TERMS_NOT_ACCEPTED':
      return 'player.error.terms';
    case 'BOOKING_SLOT_TAKEN':
      return 'player.error.slotTaken';
    case 'BOOKING_SLOT_INVALID':
      return 'player.error.slotInvalid';
    case 'BOOKING_FULL':
      return 'player.error.bookingFull';
    case 'RATE_LIMITED':
      return 'player.error.tooMany';
    default:
      return 'player.error.generic';
  }
}

export function parsePhone(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' ? toE164(value) : null;
}

export const otpCodeSchema = z.string().regex(/^[0-9]{6}$/);

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' || v === null ? null : v), schema.nullable());

export const profileSchema = z.object({
  display_name: z.string().trim().min(1).max(80),
  declared_category: optional(z.enum(['1', '2', '3', '4', '5', '6', '7', '8'])),
  dominant_hand: optional(z.enum(['right', 'left'])),
  playing_side: optional(z.enum(['drive', 'reves', 'both'])),
  birth_date: optional(z.iso.date()),
  training_opt_out: z.boolean(),
});

/** The profile form as a `UserUpdate`, or null when a field is not valid. */
export function parseProfile(formData: FormData): Schema<'UserUpdate'> | null {
  const parsed = profileSchema.safeParse({
    display_name: formData.get('display_name'),
    declared_category: formData.get('declared_category'),
    dominant_hand: formData.get('dominant_hand'),
    playing_side: formData.get('playing_side'),
    birth_date: formData.get('birth_date'),
    training_opt_out: formData.get('training_opt_out') === 'on',
  });
  return parsed.success ? parsed.data : null;
}

export const bookingSchema = z.object({
  court_id: z.uuid(),
  starts_at: z.iso.datetime(),
  duration_minutes: z.coerce.number().pipe(z.union([z.literal(60), z.literal(90), z.literal(120)])),
});
