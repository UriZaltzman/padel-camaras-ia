import type { Metadata } from 'next';

import { OnboardingWizard } from '@/components/console/onboarding-wizard';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t('admin.onb.title') };

export default function AdminNewClubPage() {
  return <OnboardingWizard />;
}
