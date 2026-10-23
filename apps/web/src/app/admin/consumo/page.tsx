import type { Metadata } from 'next';

import { UsageTable } from '@/components/console/usage-table';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t('admin.usage.title') };

export default function AdminUsagePage() {
  return <UsageTable />;
}
