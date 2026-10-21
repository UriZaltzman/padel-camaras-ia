import Link from 'next/link';
import type { ReactNode } from 'react';

import { t } from '@/i18n';
import { getAccessToken } from '@/lib/player/session';

import { signOut } from './actions';

export default async function PlayerLayout({ children }: { children: ReactNode }) {
  const signedIn = (await getAccessToken()) !== null;
  return (
    <>
      <nav aria-label={t('player.nav.label')} className="bg-night px-4 py-3 text-white">
        <ul className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 font-semibold">
          <li>
            <Link href="/reservar">{t('player.nav.book')}</Link>
          </li>
          {signedIn ? (
            <>
              <li>
                <Link href="/mis-reservas">{t('player.nav.bookings')}</Link>
              </li>
              <li>
                <Link href="/perfil">{t('player.nav.profile')}</Link>
              </li>
              <li className="ml-auto">
                <form action={signOut}>
                  <button type="submit" className="min-h-11 underline">
                    {t('player.nav.signOut')}
                  </button>
                </form>
              </li>
            </>
          ) : (
            <li className="ml-auto">
              <Link href="/ingresar">{t('player.nav.signIn')}</Link>
            </li>
          )}
        </ul>
      </nav>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">{children}</main>
    </>
  );
}
