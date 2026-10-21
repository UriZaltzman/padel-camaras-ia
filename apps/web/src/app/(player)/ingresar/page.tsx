import type { Metadata } from 'next';

import { SignInForm } from '@/components/player/sign-in-form';
import { t } from '@/i18n';
import { safeNext } from '@/lib/player/api';

export const metadata: Metadata = { title: t('player.signIn.title') };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="font-display text-3xl font-bold">{t('player.signIn.title')}</h1>
      <p>{t('player.signIn.lead')}</p>
      <SignInForm next={safeNext(next)} />
    </>
  );
}
