import type { Schema } from '@app/contracts';
import { DataLabel } from '@app/ui/web';

import { t } from '@/i18n';

export function StatusLabel({ status }: { status: Schema<'AdminClubStatus'> }) {
  return <DataLabel label={t(`admin.status.${status}`)} />;
}
