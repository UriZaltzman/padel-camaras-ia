import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { TournamentsHome } from '@/components/club-panel/tournaments-home';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t('tournaments.title') };

export default async function TournamentsPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  if (!z.uuid().safeParse(clubId).success) notFound();
  return <TournamentsHome clubId={clubId} />;
}
