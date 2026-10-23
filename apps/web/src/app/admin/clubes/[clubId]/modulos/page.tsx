import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { ModulesConfigurator } from '@/components/console/modules-configurator';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t('admin.modules.title') };

export default async function AdminClubModulesPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  if (!z.uuid().safeParse(clubId).success) notFound();
  return <ModulesConfigurator clubId={clubId} />;
}
