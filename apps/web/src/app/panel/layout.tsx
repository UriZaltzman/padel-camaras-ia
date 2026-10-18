import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { t } from '@/i18n';

/**
 * PLACEHOLDER GUARD: there is no sign-in yet. Until auth lands (owner session and memberships of
 * section 12), the club panel only opens outside production builds and shows a notice saying so;
 * a production build answers 404 for every `/panel` route. Replace this with the real session
 * check when the auth issue is done.
 */
export default function PanelLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <>
      <p role="note" className="bg-night px-4 py-2 text-center text-sm font-semibold text-white">
        {t('panel.guard.notice')}
      </p>
      {children}
    </>
  );
}
