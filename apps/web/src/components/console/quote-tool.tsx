'use client';

import { Card } from '@app/ui/web';
import { useId, useState } from 'react';

import { t } from '@/i18n';
import { quote, type Bom, type BomItem } from '@/lib/hardware/bom';
import { formatCents } from '@/lib/player/format';

const usd = (n: number) => `US$ ${n.toLocaleString('es-AR')}`;

function ItemsTable({ title, items }: { title: string; items: BomItem[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">{title}</h2>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th scope="col">{t('admin.quote.item')}</th>
            <th scope="col">{t('admin.quote.qty')}</th>
            <th scope="col">{t('admin.quote.usd')}</th>
            <th scope="col">{t('admin.quote.status')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.item} className="border-t border-line">
              <td className="py-1">{i.item}</td>
              <td>{i.qty}</td>
              <td>{usd(i.usd_estimated_total)}</td>
              <td>{t(`admin.quote.status.${i.status}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Hardware quote: every number comes from `bom` (infra/hardware/bom.yaml), none from this file. */
export function QuoteTool({ bom }: { bom: Bom }) {
  const [courts, setCourts] = useState(2);
  const id = useId();
  const q = quote(bom, courts);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">{t('admin.quote.title')}</h1>
      <p>{t('admin.quote.lead')}</p>
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="font-semibold">
          {t('admin.quote.courts')}
        </label>
        <input
          id={id}
          type="number"
          min={1}
          max={50}
          value={courts}
          onChange={(e) => {
            const n = Math.trunc(Number(e.target.value));
            if (Number.isFinite(n) && n >= 1) setCourts(Math.min(n, 50));
          }}
          className="min-h-11 w-32 rounded-xl border border-line bg-white px-3 py-2 text-night focus:border-court focus:outline-2 focus:outline-court"
        />
      </div>
      {q.isEstimate && (
        <p role="note" className="border-l-4 border-alert pl-2 font-semibold">
          {t('admin.quote.estimate')}
        </p>
      )}
      <Card>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-semibold">{t('admin.quote.total.cost')}</dt>
            <dd data-testid="cost">
              {usd(q.usdTotal)} · {formatCents(q.arsTotalCents)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold">
              {t('admin.quote.total.purchase', {
                markup: Math.round(bom.markup_purchase_plan * 100),
              })}
            </dt>
            <dd data-testid="purchase">{formatCents(q.arsPurchasePlanCents)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm">{t('admin.quote.total.loan')}</p>
        <p className="text-sm">{t('admin.quote.fx', { rate: bom.fx_ars_per_usd })}</p>
      </Card>
      <ItemsTable title={t('admin.quote.perCourt')} items={bom.per_court} />
      <ItemsTable title={t('admin.quote.perClub')} items={bom.per_club} />
    </main>
  );
}
