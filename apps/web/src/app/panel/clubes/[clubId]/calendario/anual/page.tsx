import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { YearCalendar } from '@/components/club-panel/year-calendar';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t('yearCal.title') };

export default async function YearCalendarPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  if (!z.uuid().safeParse(clubId).success) notFound();
  return <YearCalendar clubId={clubId} />;
}
