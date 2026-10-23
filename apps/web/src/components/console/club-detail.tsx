'use client';

import type { ApiClient, Schema } from '@app/contracts';
import { Card } from '@app/ui/web';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { t } from '@/i18n';
import { apiClient } from '@/lib/api/client';
import { formatCents, formatDateTime } from '@/lib/player/format';

import { StatusLabel } from './status-label';

const TABS = ['summary', 'contract', 'modules', 'users', 'activity'] as const;
type Tab = (typeof TABS)[number];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm font-semibold">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const onOff = (on: boolean) => t(on ? 'admin.detail.on' : 'admin.detail.off');

/** SA-03a: club file with tabs. */
export function ClubDetail({ clubId, client = apiClient }: { clubId: string; client?: ApiClient }) {
  const [tab, setTab] = useState<Tab>('summary');
  const query = useQuery({
    queryKey: ['admin', 'club', clubId],
    queryFn: async () => {
      const { data, error } = await client.GET('/admin/clubs/{id}', {
        params: { path: { id: clubId } },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <Link href="/admin/clubes" className="min-h-11 font-semibold underline">
        {t('admin.detail.back')}
      </Link>
      {query.isPending && <p>{t('admin.loading')}</p>}
      {query.isError && (
        <p role="alert" className="border-l-4 border-alert pl-2 font-semibold">
          {t('admin.error')}
        </p>
      )}
      {query.data && (
        <>
          <header className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{query.data.name}</h1>
            <StatusLabel status={query.data.status} />
          </header>
          <div
            role="tablist"
            aria-label={t('admin.detail.tablist')}
            className="flex flex-wrap gap-2"
          >
            {TABS.map((id) => (
              <button
                key={id}
                id={`tab-${id}`}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls="club-tabpanel"
                className={`min-h-11 rounded-xl border px-3 font-semibold ${
                  tab === id
                    ? 'border-court bg-court text-white'
                    : 'border-line bg-white text-night'
                }`}
                onClick={() => setTab(id)}
              >
                {t(`admin.detail.tab.${id}`)}
              </button>
            ))}
          </div>
          <Card>
            <div id="club-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
              <TabBody tab={tab} club={query.data} />
            </div>
          </Card>
        </>
      )}
    </main>
  );
}

function TabBody({ tab, club }: { tab: Tab; club: Schema<'AdminClubDetail'> }) {
  if (tab === 'summary') {
    const usage = club.tier_usage;
    return (
      <dl className="grid gap-3 sm:grid-cols-2">
        <Field label={t('admin.detail.tier')}>{usage.tier.name}</Field>
        <Field label={t('admin.detail.activePlayers')}>{usage.active_players_90d}</Field>
        <Field label={t('admin.detail.nextTierLabel')}>
          {usage.next_tier_at === null
            ? t('admin.detail.topTier')
            : t('admin.detail.nextTier', { count: usage.next_tier_at })}
        </Field>
        <Field label={t('admin.detail.balance')}>{formatCents(club.billing.balance_cents)}</Field>
        <Field label={t('admin.detail.overdueDays')}>{club.billing.overdue_days}</Field>
        <Field label={t('admin.detail.whitelabel')}>{club.whitelabel_url}</Field>
        <Field label={t('admin.detail.createdAt')}>{formatDateTime(club.created_at)}</Field>
      </dl>
    );
  }
  if (tab === 'contract') {
    const legal = club.legal;
    return (
      <div className="flex flex-col gap-3">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label={t('admin.detail.plan')}>{t(`admin.plan.${club.plan}`)}</Field>
          <Field label={t('admin.detail.legalName')}>{legal.legal_name}</Field>
          <Field label={t('admin.detail.taxId')}>{legal.tax_id}</Field>
          <Field label={t('admin.detail.contact')}>
            {legal.contact_name} · {legal.contact_phone} · {legal.contact_email}
          </Field>
          <Field label={t('admin.detail.address')}>
            {legal.address}, {legal.city}
          </Field>
        </dl>
        <p>{t(`admin.detail.contract.${club.plan}`)}</p>
        {club.plan === 'purchase' && (
          <Link href="/admin/cotizador" className="min-h-11 font-semibold underline">
            {t('admin.detail.contract.quoteLink')}
          </Link>
        )}
      </div>
    );
  }
  if (tab === 'modules') {
    const m = club.modules;
    return (
      <div className="flex flex-col gap-3">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label={t('admin.detail.module.deposit')}>{onOff(m.deposit.enabled)}</Field>
          <Field label={t('admin.detail.module.branding')}>{m.branding.mode}</Field>
          <Field label={t('admin.detail.module.lessons')}>
            {t(`admin.detail.lessons.${m.lesson_mode}`)}
          </Field>
          <Field label={t('admin.detail.module.aiVideo')}>
            {t(`admin.detail.aiVideo.${m.ai_video}`)}
          </Field>
          <Field label={t('admin.detail.module.tournaments')}>{onOff(m.tournaments)}</Field>
        </dl>
        <Link
          href={`/admin/clubes/${club.id}/modulos`}
          className="min-h-11 font-semibold underline"
        >
          {t('admin.modules.link')}
        </Link>
      </div>
    );
  }
  if (tab === 'users') {
    return club.users.length === 0 ? (
      <p>{t('admin.detail.users.empty')}</p>
    ) : (
      <ul>
        {club.users.map((u) => (
          <li key={u.id}>
            {u.name} · {u.role}
          </li>
        ))}
      </ul>
    );
  }
  return club.recent_audit.length === 0 ? (
    <p>{t('admin.detail.activity.empty')}</p>
  ) : (
    <ul>
      {club.recent_audit.map((e) => (
        <li key={e.id}>
          {formatDateTime(e.at)} · {e.action} · {e.target}
          {e.reason ? ` · ${e.reason}` : ''}
        </li>
      ))}
    </ul>
  );
}
