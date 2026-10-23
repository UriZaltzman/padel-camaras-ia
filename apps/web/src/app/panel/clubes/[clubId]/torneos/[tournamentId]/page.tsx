import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { TournamentDetail } from '@/components/club-panel/tournament-detail';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t('tournaments.title') };

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ clubId: string; tournamentId: string }>;
}) {
  const { clubId, tournamentId } = await params;
  if (!z.uuid().safeParse(clubId).success || !z.uuid().safeParse(tournamentId).success) notFound();
  return <TournamentDetail clubId={clubId} tournamentId={tournamentId} />;
}
