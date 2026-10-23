import type { Metadata } from 'next';

import { ClubsList } from '@/components/console/clubs-list';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t('admin.clubs.title') };

export default function AdminClubsPage() {
  return <ClubsList />;
}
