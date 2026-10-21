'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { apiClient } from '@/lib/api/client';
import { playerClient, requireAccessToken, safeNext } from '@/lib/player/api';
import { currentConsent } from '@/lib/player/consent';
import {
  bookingSchema,
  errorMessage,
  otpCodeSchema,
  parsePhone,
  parseProfile,
  type FormState,
  type InviteState,
  type SignInState,
} from '@/lib/player/forms';
import { clearSession, saveBookingRef, saveSession } from '@/lib/player/session';

// Server actions only run for same-origin POSTs (Next checks Origin against Host), so these
// forms carry no extra CSRF token, like the contact form.

export async function requestCode(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const phone = parsePhone(formData.get('phone'));
  if (!phone) return { step: 'phone', error: 'player.error.phone' };
  const { error } = await apiClient.POST('/auth/otp/whatsapp', { body: { phone } });
  if (error) return { step: 'phone', error: errorMessage(error.code) };
  return { step: 'code', phone, needsConsent: false };
}

export async function verifyCode(prev: SignInState, formData: FormData): Promise<SignInState> {
  if (prev.step !== 'code') return prev;
  const code = otpCodeSchema.safeParse(String(formData.get('code') ?? '').trim());
  if (!code.success) return { ...prev, error: 'player.error.code' };
  const accepted = formData.get('consent') === 'on';
  if (prev.needsConsent && !accepted) {
    return { ...prev, code: code.data, error: 'player.error.terms' };
  }
  const { data, error } = await apiClient.POST('/auth/otp/verify', {
    body: { phone: prev.phone, code: code.data, ...(accepted ? { consent: currentConsent } : {}) },
  });
  // The form resets after each action, so the code comes back to fill it again.
  if (error?.code === 'TERMS_NOT_ACCEPTED') return { ...prev, needsConsent: true, code: code.data };
  if (error || !data) return { ...prev, error: errorMessage(error?.code) };
  await saveSession(data);
  redirect(data.is_new_user ? '/perfil?bienvenida=1' : safeNext(formData.get('next')));
}

export async function signOut(): Promise<void> {
  await clearSession();
  redirect('/ingresar');
}

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = await requireAccessToken('/perfil');
  const body = parseProfile(formData);
  if (!body) return { status: 'error', error: 'player.error.profile' };
  const { error } = await playerClient(token).PATCH('/me', { body });
  if (error) return { status: 'error', error: errorMessage(error.code) };
  revalidatePath('/perfil');
  return { status: 'saved' };
}

export async function createBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  const back = String(formData.get('back') ?? '/reservar');
  const token = await requireAccessToken(safeNext(back));
  const parsed = bookingSchema.safeParse({
    court_id: formData.get('court_id'),
    starts_at: formData.get('starts_at'),
    duration_minutes: formData.get('duration_minutes'),
  });
  if (!parsed.success) return { status: 'error', error: 'player.error.slotInvalid' };
  const { data, error } = await playerClient(token).POST('/bookings', {
    body: { ...parsed.data, no_record: false },
  });
  if (error || !data) {
    revalidatePath('/reservar');
    return { status: 'error', error: errorMessage(error?.code) };
  }
  await saveBookingRef(data);
  redirect(`/mis-reservas?nueva=${data.id}`);
}

export async function inviteToBooking(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const token = await requireAccessToken('/mis-reservas');
  const id = String(formData.get('booking_id') ?? '');
  const { data, error } = await playerClient(token).POST('/bookings/{id}/invite', {
    params: { path: { id } },
    body: {},
  });
  if (error || !data) return { status: 'error', error: errorMessage(error?.code) };
  return { status: 'ready', url: data.url };
}

export async function cancelBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = await requireAccessToken('/mis-reservas');
  const id = String(formData.get('booking_id') ?? '');
  const { data, error } = await playerClient(token).POST('/bookings/{id}/cancel', {
    params: { path: { id } },
    body: { scope: 'this' },
  });
  if (error || !data) return { status: 'error', error: errorMessage(error?.code) };
  await saveBookingRef({ id, status: data.status });
  revalidatePath('/mis-reservas');
  return { status: 'saved' };
}
