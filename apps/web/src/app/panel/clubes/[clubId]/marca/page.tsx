import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { BrandSettingsPanel } from '@/components/club-panel/brand-settings-panel';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t('brand.title') };

export default async function BrandSettingsPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  if (!z.uuid().safeParse(clubId).success) notFound();
  return <BrandSettingsPanel clubId={clubId} />;
}
