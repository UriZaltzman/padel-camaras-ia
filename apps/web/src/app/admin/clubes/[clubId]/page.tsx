import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { ClubDetail } from '@/components/console/club-detail';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t('admin.clubs.title') };

export default async function AdminClubPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  if (!z.uuid().safeParse(clubId).success) notFound();
  return <ClubDetail clubId={clubId} />;
}
