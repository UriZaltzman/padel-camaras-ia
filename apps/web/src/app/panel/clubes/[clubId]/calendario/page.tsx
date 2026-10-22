import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { BookingCalendar } from '@/components/club-panel/booking-calendar';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t('calendar.title') };

export default async function BookingCalendarPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  if (!z.uuid().safeParse(clubId).success) notFound();
  return <BookingCalendar clubId={clubId} />;
}
