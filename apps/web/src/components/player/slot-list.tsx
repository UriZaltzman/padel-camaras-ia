'use client';

import type { Schema } from '@app/contracts';
import { useActionState } from 'react';

import { createBooking } from '@/app/(player)/actions';
import { t } from '@/i18n';
import { formatCents, formatTime } from '@/lib/player/format';
import { initialFormState, type FormState } from '@/lib/player/forms';

import { errorClass } from './styles';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/** Free slots of a court; picking one holds it (`POST /bookings`). */
export function SlotList({
  courtId,
  durationMinutes,
  slots,
  back,
  action = createBooking,
}: {
  courtId: string;
  durationMinutes: number;
  slots: Schema<'AvailabilitySlot'>[];
  back: string;
  action?: Action;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  if (slots.length === 0) return <p>{t('player.book.noSlots')}</p>;
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="court_id" value={courtId} />
      <input type="hidden" name="duration_minutes" value={durationMinutes} />
      <input type="hidden" name="back" value={back} />
      {state.status === 'error' && (
        <p role="alert" className={errorClass}>
          {t(state.error)}
        </p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {slots.map((slot) => {
          const label = t('player.book.slot', {
            from: formatTime(slot.starts_at),
            to: formatTime(slot.ends_at),
            price: formatCents(slot.amount_cents),
          });
          return (
            <li key={slot.starts_at}>
              <button
                type="submit"
                name="starts_at"
                value={slot.starts_at}
                disabled={pending}
                className="flex min-h-11 w-full flex-col rounded-xl border border-line bg-white px-3 py-2 text-left text-night hover:border-court focus:outline-2 focus:outline-court disabled:opacity-60"
              >
                <span className="font-semibold">{label}</span>
                <span className="text-sm">
                  {slot.deposit_cents > 0
                    ? t('player.book.deposit', { deposit: formatCents(slot.deposit_cents) })
                    : t('player.book.noDeposit')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </form>
  );
}
