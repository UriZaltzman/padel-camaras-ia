import type { Metadata } from 'next';
import Link from 'next/link';

import { BookingActions } from '@/components/player/booking-actions';
import { t, type MessageKey } from '@/i18n';
import { requireAccessToken } from '@/lib/player/api';
import { formatCents, formatDateTime, formatTime } from '@/lib/player/format';
import { getBookingRefs } from '@/lib/player/session';

export const metadata: Metadata = { title: t('player.bookings.title') };

const statusKeys: Record<string, MessageKey> = {
  held: 'player.bookings.status.held',
  confirmed: 'player.bookings.status.confirmed',
  cancelled: 'player.bookings.status.cancelled',
  expired: 'player.bookings.status.expired',
};

export default async function MyBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ nueva?: string }>;
}) {
  const { nueva } = await searchParams;
  await requireAccessToken('/mis-reservas');
  const bookings = await getBookingRefs();
  return (
    <>
      <h1 className="font-display text-3xl font-bold">{t('player.bookings.title')}</h1>
      {nueva && bookings.some((b) => b.id === nueva) && (
        <p role="status" className="rounded-xl bg-court px-4 py-3 font-semibold text-white">
          {t('player.bookings.created')}
        </p>
      )}
      {bookings.length === 0 ? (
        <p>
          {t('player.bookings.empty')} <Link href="/reservar">{t('player.nav.book')}</Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {bookings.map((b) => (
            <li key={b.id} className="flex flex-col gap-2 rounded-xl border border-line p-4">
              <p className="font-semibold">
                {t('player.bookings.when', {
                  from: formatDateTime(b.starts_at),
                  to: formatTime(b.ends_at),
                })}
              </p>
              <p>
                {t(statusKeys[b.status] ?? 'player.bookings.status.other')} ·{' '}
                {t('player.bookings.price', { price: formatCents(b.price_cents) })}
              </p>
              {b.status === 'held' && b.deposit_cents > 0 && b.hold_expires_at && (
                <p>
                  {t('player.bookings.depositPending', {
                    deposit: formatCents(b.deposit_cents),
                    until: formatTime(b.hold_expires_at),
                  })}
                </p>
              )}
              {(b.status === 'held' || b.status === 'confirmed') && (
                <BookingActions bookingId={b.id} canCancel={b.status === 'confirmed'} />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
