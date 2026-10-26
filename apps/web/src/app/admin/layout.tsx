import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { AdminShell } from '@/components/shells';
import { t } from '@/i18n';

/**
 * PLACEHOLDER GUARD: staff sign-in does not exist yet (roles of section 12). Until it lands, the
 * internal console only opens outside production builds, where the API is a mock; a production
 * build answers 404 for every `/admin` route. Replace with the real staff session check.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <AdminShell
      banner={
        <p
          role="note"
          className="bg-night px-4 py-2 text-center text-sm font-semibold text-white print:hidden"
        >
          {t('admin.guard.notice')}
        </p>
      }
    >
      {children}
    </AdminShell>
  );
}
