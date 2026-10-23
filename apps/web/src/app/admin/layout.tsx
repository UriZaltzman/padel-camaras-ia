import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { t } from '@/i18n';

/**
 * PLACEHOLDER GUARD: staff sign-in does not exist yet (roles of section 12). Until it lands, the
 * internal console only opens outside production builds, where the API is a mock; a production
 * build answers 404 for every `/admin` route. Replace with the real staff session check.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <>
      <p
        role="note"
        className="print:hidden bg-night px-4 py-2 text-center text-sm font-semibold text-white"
      >
        {t('admin.guard.notice')}
      </p>
      <nav
        aria-label={t('admin.nav.label')}
        className="flex gap-4 border-b print:hidden border-line px-4 py-3"
      >
        <Link href="/admin/clubes" className="min-h-11 font-semibold">
          {t('admin.nav.clubs')}
        </Link>
        <Link href="/admin/clubes/nuevo" className="min-h-11 font-semibold">
          {t('admin.nav.new')}
        </Link>
        <Link href="/admin/consumo" className="min-h-11 font-semibold">
          {t('admin.nav.usage')}
        </Link>
        <Link href="/admin/tarifas" className="min-h-11 font-semibold">
          {t('admin.nav.tariffs')}
        </Link>
        <Link href="/admin/cotizador" className="min-h-11 font-semibold">
          {t('admin.nav.quote')}
        </Link>
      </nav>
      {children}
    </>
  );
}
