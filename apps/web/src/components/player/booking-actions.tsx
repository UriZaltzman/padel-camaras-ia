'use client';

import { Button } from '@app/ui/web';
import { useActionState } from 'react';

import { cancelBooking, inviteToBooking } from '@/app/(player)/actions';
import { t } from '@/i18n';
import { initialFormState, type FormState, type InviteState } from '@/lib/player/forms';

import { errorClass, inputClass } from './styles';

type InviteAction = (state: InviteState, formData: FormData) => Promise<InviteState>;
type CancelAction = (state: FormState, formData: FormData) => Promise<FormState>;

export function BookingActions({
  bookingId,
  canCancel,
  invite = inviteToBooking,
  cancel = cancelBooking,
}: {
  bookingId: string;
  canCancel: boolean;
  invite?: InviteAction;
  cancel?: CancelAction;
}) {
  const [inviteState, inviteAction, invitePending] = useActionState<InviteState, FormData>(invite, {
    status: 'idle',
  });
  const [cancelState, cancelAction, cancelPending] = useActionState(cancel, initialFormState);
  const whatsapp =
    inviteState.status === 'ready'
      ? `https://wa.me/?text=${encodeURIComponent(t('player.bookings.inviteText', { url: inviteState.url }))}`
      : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <form action={inviteAction}>
          <input type="hidden" name="booking_id" value={bookingId} />
          <Button
            type="submit"
            variant="secondary"
            disabled={invitePending}
            label={t('player.bookings.invite')}
          />
        </form>
        {canCancel && (
          <form action={cancelAction}>
            <input type="hidden" name="booking_id" value={bookingId} />
            <Button
              type="submit"
              variant="secondary"
              disabled={cancelPending}
              label={t('player.bookings.cancel')}
            />
          </form>
        )}
      </div>
      {inviteState.status === 'ready' && whatsapp && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {t('player.bookings.inviteLink')}
            <input readOnly value={inviteState.url} className={inputClass} />
          </label>
          <a href={whatsapp} target="_blank" rel="noreferrer" className="font-semibold underline">
            {t('player.bookings.shareWhatsapp')}
          </a>
        </div>
      )}
      {[inviteState, cancelState].map((s, i) =>
        s.status === 'error' ? (
          <p key={i} role="alert" className={errorClass}>
            {t(s.error)}
          </p>
        ) : null,
      )}
    </div>
  );
}
