'use client';

import { ConsoleShell, PanelShell, type NavItem } from '@app/ui/web';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { t } from '@/i18n';
import { tr } from '@/i18n/responsive';

const labels = () => ({
  nav: tr('panel.shell.nav'),
  openMenu: tr('shell.menu.open'),
  closeMenu: tr('shell.menu.close'),
});

/** Navigation of one club in the panel: side menu on laptop, drawer below. */
export function ClubPanelShell({ clubId, children }: { clubId: string; children: ReactNode }) {
  const pathname = usePathname();
  const base = `/panel/clubes/${clubId}`;
  const items: NavItem[] = [
    { href: `${base}/calendario`, label: tr('panel.nav.calendar') },
    { href: `${base}/calendario/anual`, label: tr('panel.nav.yearCalendar') },
    { href: `${base}/caja`, label: tr('panel.nav.cash') },
    { href: `${base}/jugadores`, label: tr('panel.nav.players') },
    { href: `${base}/torneos`, label: tr('panel.nav.tournaments') },
    { href: `${base}/canchas`, label: tr('panel.nav.courts') },
    { href: `${base}/marca`, label: tr('panel.nav.brand') },
  ];
  // The most specific item that matches the path is the current one.
  const current = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <PanelShell
      title={tr('panel.shell.title')}
      items={items}
      {...(current ? { currentHref: current } : {})}
      labels={labels()}
      linkComponent={Link}
    >
      {children}
    </PanelShell>
  );
}

/** Internal console navigation. */
export function AdminShell({ banner, children }: { banner: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const items: NavItem[] = [
    { href: '/admin/clubes', label: t('admin.nav.clubs') },
    { href: '/admin/clubes/nuevo', label: t('admin.nav.new') },
    { href: '/admin/consumo', label: t('admin.nav.usage') },
    { href: '/admin/tarifas', label: t('admin.nav.tariffs') },
    { href: '/admin/cotizador', label: t('admin.nav.quote') },
  ];
  const current = items
    .filter((i) => pathname === i.href)
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <ConsoleShell
      title={tr('admin.shell.title')}
      items={items}
      {...(current ? { currentHref: current } : {})}
      labels={{ ...labels(), nav: t('admin.nav.label') }}
      linkComponent={Link}
      banner={banner}
    >
      {children}
    </ConsoleShell>
  );
}
