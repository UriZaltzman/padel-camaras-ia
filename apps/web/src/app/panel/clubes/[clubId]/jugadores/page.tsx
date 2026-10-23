import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { PlayersCrm } from '@/components/club-panel/players-crm';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t('crm.title') };

export default async function PlayersPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  if (!z.uuid().safeParse(clubId).success) notFound();
  return <PlayersCrm clubId={clubId} />;
}
