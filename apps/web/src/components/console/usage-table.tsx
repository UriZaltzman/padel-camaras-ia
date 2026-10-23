'use client';

import type { ApiClient } from '@app/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { t } from '@/i18n';
import { apiClient } from '@/lib/api/client';
import { formatCents } from '@/lib/player/format';

const input =
  'min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-night focus:border-court focus:outline-2 focus:outline-court';

/** SA-06: usage and metering per club for a month, with the near-limit alert. */
export function UsageTable({ client = apiClient }: { client?: ApiClient }) {
  const [period, setPeriod] = useState('');
  const [nearLimit, setNearLimit] = useState(false);
  const query = useQuery({
    queryKey: ['admin', 'usage', period, nearLimit],
    queryFn: async () => {
      const { data, error } = await client.GET('/admin/usage', {
        params: {
          query: { ...(period ? { period } : {}), ...(nearLimit ? { near_limit: true } : {}) },
        },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">{t('admin.usage.title')}</h1>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 font-semibold">
          {t('admin.usage.period')}
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className={input}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={nearLimit}
            onChange={(e) => setNearLimit(e.target.checked)}
            className="size-5"
          />
          {t('admin.usage.nearOnly')}
        </label>
      </div>
      {query.isPending && <p>{t('admin.loading')}</p>}
      {query.isError && (
        <p role="alert" className="border-l-4 border-alert pl-2 font-semibold">
          {t('admin.error')}
        </p>
      )}
      {query.data && query.data.items.length === 0 && (
        <p className="rounded-xl border border-line bg-white p-6 text-center">
          {t('admin.usage.empty')}
        </p>
      )}
      {query.data && query.data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th scope="col">{t('admin.usage.col.club')}</th>
                <th scope="col">{t('admin.usage.col.players')}</th>
                <th scope="col">{t('admin.usage.col.bookings')}</th>
                <th scope="col">{t('admin.usage.col.matches')}</th>
                <th scope="col">{t('admin.usage.col.storage')}</th>
                <th scope="col">{t('admin.usage.col.video')}</th>
                <th scope="col">{t('admin.usage.col.cost')}</th>
                <th scope="col">{t('admin.usage.col.invoiced')}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((r) => (
                <tr key={r.club_id} className="border-t border-line">
                  <th scope="row" className="py-2 font-semibold">
                    {r.club_name}
                  </th>
                  <td>
                    {r.tier_usage.active_players_90d}
                    {r.near_limit && r.tier_usage.next_tier_at !== null && (
                      <span className="ml-2 rounded-full border border-alert px-2 text-sm font-semibold">
                        {t('admin.usage.near', { at: r.tier_usage.next_tier_at })}
                      </span>
                    )}
                  </td>
                  <td>{r.bookings}</td>
                  <td>{r.recorded_matches}</td>
                  <td>{r.storage_gb.toLocaleString('es-AR')}</td>
                  <td>{r.video_minutes.toLocaleString('es-AR')}</td>
                  <td>{formatCents(r.estimated_cost_cents)}</td>
                  <td>{formatCents(r.invoiced_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
