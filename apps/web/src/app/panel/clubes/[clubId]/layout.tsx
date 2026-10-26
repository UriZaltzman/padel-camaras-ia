import type { ReactNode } from 'react';

import { ClubPanelShell } from '@/components/shells';

export default async function ClubLayout({
  params,
  children,
}: {
  params: Promise<{ clubId: string }>;
  children: ReactNode;
}) {
  const { clubId } = await params;
  return <ClubPanelShell clubId={clubId}>{children}</ClubPanelShell>;
}
