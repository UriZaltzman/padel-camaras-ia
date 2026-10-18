import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { CourtSettingsPanel } from '@/components/club-panel/court-settings-panel';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t('courts.title') };

export default async function CourtSettingsPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  if (!z.uuid().safeParse(clubId).success) notFound();
  return <CourtSettingsPanel clubId={clubId} />;
}
