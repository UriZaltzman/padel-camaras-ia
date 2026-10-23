'use client';

import type { ApiClient, Schema } from '@app/contracts';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { t } from '@/i18n';
import { apiClient } from '@/lib/api/client';
import { formatCents, formatDateTime } from '@/lib/player/format';

import { StatusLabel } from './status-label';

export const STATUSES: Schema<'AdminClubStatus'>[] = [
  'trial',
  'active',
  'overdue',
  'suspended',
  'closed',
];

const chip = (selected: boolean) =>
  `min-h-11 rounded-xl border px-3 font-semibold ${
    selected ? 'border-court bg-court text-white' : 'border-line bg-white text-night'
  }`;

/** SA-03: clubs with a status filter and an empty state. */
export function ClubsList({ client = apiClient }: { client?: ApiClient }) {
  const [status, setStatus] = useState<Schema<'AdminClubStatus'> | null>(null);
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['admin', 'clubs', status, search],
    queryFn: async () => {
      const { data, error } = await client.GET('/admin/clubs', {
        params: { query: { ...(status ? { status } : {}), ...(search ? { q: search } : {}) } },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });
  const filtered = status !== null || search !== '';

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">{t('admin.clubs.title')}</h1>
      <input
        type="search"
        aria-label={t('admin.clubs.search')}
        placeholder={t('admin.clubs.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-night focus:border-court focus:outline-2 focus:outline-court"
      />
      <div role="group" aria-label={t('admin.clubs.filter.label')} className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={status === null}
          className={chip(status === null)}
          onClick={() => setStatus(null)}
        >
          {t('admin.clubs.filter.all')}
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            className={chip(status === s)}
            onClick={() => setStatus(s)}
          >
            {t(`admin.status.${s}`)}
          </button>
        ))}
      </div>
      {query.isPending && <p>{t('admin.loading')}</p>}
      {query.isError && (
        <p role="alert" className="border-l-4 border-alert pl-2 font-semibold">
          {t('admin.error')}
        </p>
      )}
      {query.data && query.data.items.length === 0 && (
        <div className="rounded-xl border border-line bg-white p-6 text-center">
          {filtered ? (
            <p>{t('admin.clubs.emptyFiltered')}</p>
          ) : (
            <>
              <h2 className="text-lg font-bold">{t('admin.clubs.empty.title')}</h2>
              <p>{t('admin.clubs.empty.body')}</p>
            </>
          )}
        </div>
      )}
      {query.data && query.data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th scope="col">{t('admin.clubs.col.name')}</th>
                <th scope="col">{t('admin.clubs.col.city')}</th>
                <th scope="col">{t('admin.clubs.col.status')}</th>
                <th scope="col">{t('admin.clubs.col.plan')}</th>
                <th scope="col">{t('admin.clubs.col.balance')}</th>
                <th scope="col">{t('admin.clubs.col.lastPayment')}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((club) => (
                <tr key={club.id} className="border-t border-line">
                  <td className="py-2">
                    <Link href={`/admin/clubes/${club.id}`} className="font-semibold underline">
                      {club.name}
                    </Link>
                  </td>
                  <td>{club.city}</td>
                  <td>
                    <StatusLabel status={club.status} />
                  </td>
                  <td>{t(`admin.plan.${club.plan}`)}</td>
                  <td>{formatCents(club.balance_cents)}</td>
                  <td>
                    {club.last_payment_at
                      ? formatDateTime(club.last_payment_at)
                      : t('admin.clubs.noPayment')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
