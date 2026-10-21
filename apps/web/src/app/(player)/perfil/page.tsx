import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ProfileForm } from '@/components/player/profile-form';
import { t } from '@/i18n';
import { playerClient, requireAccessToken } from '@/lib/player/api';

export const metadata: Metadata = { title: t('player.profile.title') };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ bienvenida?: string }>;
}) {
  const { bienvenida } = await searchParams;
  const token = await requireAccessToken('/perfil');
  const { data: user, response } = await playerClient(token).GET('/me');
  if (response.status === 401) redirect('/ingresar?next=/perfil');
  if (!user) return <p role="alert">{t('player.error.generic')}</p>;
  return (
    <>
      <h1 className="font-display text-3xl font-bold">{t('player.profile.title')}</h1>
      {bienvenida && <p role="status">{t('player.profile.welcome')}</p>}
      <ProfileForm user={user} />
    </>
  );
}
