import type { Metadata } from 'next';

import { TariffsEditor } from '@/components/console/tariffs-editor';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t('admin.tariffs.title') };

export default function AdminTariffsPage() {
  return <TariffsEditor />;
}
