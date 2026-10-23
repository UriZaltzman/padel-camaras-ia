import type { Metadata } from 'next';

import { QuoteTool } from '@/components/console/quote-tool';
import { t } from '@/i18n';
import type { Bom } from '@/lib/hardware/bom';
import { loadBom } from '@/lib/hardware/load-bom';

export const metadata: Metadata = { title: t('admin.quote.title') };
// The file is read on every request, so a new price in bom.yaml shows up without a rebuild.
export const dynamic = 'force-dynamic';

export default async function AdminQuotePage() {
  let bom: Bom | null = null;
  try {
    bom = await loadBom();
  } catch {
    bom = null;
  }
  if (!bom) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <p role="alert" className="border-l-4 border-alert pl-2 font-semibold">
          {t('admin.quote.loadError')}
        </p>
      </main>
    );
  }
  return <QuoteTool bom={bom} />;
}
