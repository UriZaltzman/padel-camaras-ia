import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { CashRegister } from '@/components/club-panel/cash-register';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t('cash.title') };

export default async function CashRegisterPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  if (!z.uuid().safeParse(clubId).success) notFound();
  return <CashRegister clubId={clubId} />;
}
