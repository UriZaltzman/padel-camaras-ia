'use client';

import type { ApiClient } from '@app/contracts';
import { Card } from '@app/ui/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { t } from '@/i18n';
import { apiClient } from '@/lib/api/client';
import {
  DEFAULT_MODULES,
  normalize,
  sameModules,
  validateModules,
  type Modules,
} from '@/lib/modules/model';
import { formatCents } from '@/lib/player/format';

const box =
  'min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-night focus:border-court focus:outline-2 focus:outline-court';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2 border-t border-line pt-3">
      <legend className="text-lg font-bold">{title}</legend>
      {children}
    </fieldset>
  );
}

function Radio<T extends string>(props: {
  name: string;
  value: T;
  current: T;
  label: string;
  onPick: (v: T) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2">
      <input
        type="radio"
        name={props.name}
        checked={props.current === props.value}
        onChange={() => props.onPick(props.value)}
      />
      {props.label}
    </label>
  );
}

/** SA-05: per-club module switches with the monthly price they imply. */
export function ModulesConfigurator({
  clubId,
  client = apiClient,
}: {
  clubId: string;
  client?: ApiClient;
}) {
  const queryClient = useQueryClient();
  const key = ['admin', 'club', clubId, 'modules'];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await client.GET('/admin/clubs/{id}/modules', {
        params: { path: { id: clubId } },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });
  const [draft, setDraft] = useState<Modules | null>(null);
  const [saved, setSaved] = useState(false);
  const current = draft ?? query.data?.modules ?? null;

  const save = useMutation({
    mutationFn: async (modules: Modules) => {
      const { data, error } = await client.PUT('/admin/clubs/{id}/modules', {
        params: { path: { id: clubId } },
        body: { modules: normalize(modules) },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'club', clubId] });
      setDraft(null);
      setSaved(true);
    },
  });

  // Price of the draft: the same simulator the tariffs screen uses, on the club's own version.
  const versionId = query.data?.tariff_version_id ?? null;
  const players = useQuery({
    queryKey: ['admin', 'club', clubId],
    queryFn: async () => {
      const { data, error } = await client.GET('/admin/clubs/{id}', {
        params: { path: { id: clubId } },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });
  const activePlayers = players.data?.tier_usage.active_players_90d;
  const problems = current ? validateModules(current) : [];
  const dirty = !!current && !!query.data && !sameModules(current, query.data.modules);
  const preview = useQuery({
    queryKey: [
      'admin',
      'club',
      clubId,
      'modules-preview',
      current && normalize(current),
      versionId,
    ],
    enabled:
      !!current && dirty && problems.length === 0 && !!versionId && activePlayers !== undefined,
    queryFn: async () => {
      const { data, error } = await client.POST('/admin/tariffs/simulate', {
        body: {
          active_players: activePlayers ?? 0,
          modules: normalize(current as Modules),
          tariff_version_id: versionId as string,
        },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });

  const update = (next: Modules) => {
    setSaved(false);
    setDraft(next);
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <Link href={`/admin/clubes/${clubId}`} className="min-h-11 font-semibold underline">
        {t('admin.detail.back')}
      </Link>
      <h1 className="text-2xl font-bold">{t('admin.modules.title')}</h1>
      {query.isPending && <p>{t('admin.loading')}</p>}
      {query.isError && (
        <p role="alert" className="border-l-4 border-alert pl-2 font-semibold">
          {t('admin.error')}
        </p>
      )}
      {query.data && current && (
        <Card>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (problems.length === 0) save.mutate(current);
            }}
          >
            <Section title={t('admin.modules.deposit')}>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={current.deposit.enabled}
                  onChange={(e) =>
                    update({
                      ...current,
                      deposit: { ...current.deposit, enabled: e.target.checked },
                    })
                  }
                />
                {t('admin.modules.deposit.on')}
              </label>
              {current.deposit.enabled && (
                <>
                  <Radio
                    name="deposit-kind"
                    value="percent"
                    current={current.deposit.kind}
                    label={t('admin.modules.deposit.percent')}
                    onPick={(kind) => update({ ...current, deposit: { ...current.deposit, kind } })}
                  />
                  <Radio
                    name="deposit-kind"
                    value="fixed"
                    current={current.deposit.kind}
                    label={t('admin.modules.deposit.fixed')}
                    onPick={(kind) => update({ ...current, deposit: { ...current.deposit, kind } })}
                  />
                  {current.deposit.kind === 'percent' ? (
                    <label className="flex flex-col gap-1 font-semibold">
                      {t('admin.modules.deposit.percentValue')}
                      <input
                        type="number"
                        min={1}
                        max={100}
                        className={`${box} w-36`}
                        value={current.deposit.percent ?? ''}
                        onChange={(e) =>
                          update({
                            ...current,
                            deposit: {
                              ...current.deposit,
                              percent:
                                e.target.value === '' ? null : Math.trunc(Number(e.target.value)),
                            },
                          })
                        }
                      />
                    </label>
                  ) : (
                    <label className="flex flex-col gap-1 font-semibold">
                      {t('admin.modules.deposit.amountValue')}
                      <input
                        type="number"
                        min={1}
                        className={`${box} w-36`}
                        value={
                          current.deposit.amount_cents === null
                            ? ''
                            : current.deposit.amount_cents / 100
                        }
                        onChange={(e) =>
                          update({
                            ...current,
                            deposit: {
                              ...current.deposit,
                              amount_cents:
                                e.target.value === ''
                                  ? null
                                  : Math.round(Number(e.target.value) * 100),
                            },
                          })
                        }
                      />
                    </label>
                  )}
                </>
              )}
            </Section>

            <Section title={t('admin.modules.branding')}>
              <Radio
                name="branding"
                value="generic"
                current={current.branding.mode}
                label={t('admin.modules.branding.generic')}
                onPick={(mode) => update({ ...current, branding: { ...current.branding, mode } })}
              />
              <Radio
                name="branding"
                value="own"
                current={current.branding.mode}
                label={t('admin.modules.branding.own')}
                onPick={(mode) => update({ ...current, branding: { ...current.branding, mode } })}
              />
              {current.branding.mode === 'own' && (
                <BrandingFields
                  value={current.branding}
                  onChange={(branding) => update({ ...current, branding })}
                />
              )}
            </Section>

            <Section title={t('admin.modules.lessons')}>
              {(['app', 'whatsapp'] as const).map((v) => (
                <Radio
                  key={v}
                  name="lessons"
                  value={v}
                  current={current.lesson_mode}
                  label={t(`admin.modules.lessons.${v}`)}
                  onPick={(lesson_mode) => update({ ...current, lesson_mode })}
                />
              ))}
            </Section>

            <Section title={t('admin.modules.aiVideo')}>
              {(['off', 'club_pays', 'player_pays'] as const).map((v) => (
                <Radio
                  key={v}
                  name="ai-video"
                  value={v}
                  current={current.ai_video}
                  label={t(`admin.modules.aiVideo.${v}`)}
                  onPick={(ai_video) => update({ ...current, ai_video })}
                />
              ))}
            </Section>

            <Section title={t('admin.modules.tournaments')}>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={current.tournaments}
                  onChange={(e) => update({ ...current, tournaments: e.target.checked })}
                />
                {t('admin.modules.tournaments.on')}
              </label>
            </Section>

            <section aria-labelledby="price-title" className="border-t border-line pt-3">
              <h2 id="price-title" className="text-lg font-bold">
                {t('admin.modules.price')}
              </h2>
              {query.data.estimated_monthly_cents === null ? (
                <p>{t('admin.modules.priceNone')}</p>
              ) : (
                <p data-testid="price-saved">
                  {t('admin.modules.priceSaved', {
                    amount: formatCents(query.data.estimated_monthly_cents),
                  })}
                </p>
              )}
              {dirty && preview.data && (
                <p data-testid="price-draft" className="font-semibold">
                  {t('admin.modules.priceDelta', { amount: formatCents(preview.data.total_cents) })}
                </p>
              )}
            </section>

            {problems.length > 0 && (
              <ul role="alert" className="border-l-4 border-alert pl-2 font-semibold">
                {problems.map((p) => (
                  <li key={p}>{t(`admin.modules.problem.${p}`)}</li>
                ))}
              </ul>
            )}
            {save.isError && (
              <p role="alert" className="border-l-4 border-alert pl-2 font-semibold">
                {t('admin.modules.error')}
              </p>
            )}
            {saved && <p role="status">{t('admin.modules.saved')}</p>}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={!dirty || problems.length > 0 || save.isPending}
                className="min-h-11 rounded-xl bg-court px-4 font-semibold text-white disabled:opacity-50"
              >
                {save.isPending ? t('admin.modules.saving') : t('admin.modules.save')}
              </button>
              <button
                type="button"
                disabled={!dirty}
                className="min-h-11 rounded-xl border border-line px-4 font-semibold disabled:opacity-50"
                onClick={() => setDraft(null)}
              >
                {t('admin.modules.discard')}
              </button>
              <button
                type="button"
                className="min-h-11 rounded-xl border border-line px-4 font-semibold"
                onClick={() => update(structuredClone(DEFAULT_MODULES))}
              >
                {t('admin.modules.restore')}
              </button>
            </div>
          </form>
        </Card>
      )}
    </main>
  );
}

function BrandingFields({
  value,
  onChange,
}: {
  value: Modules['branding'];
  onChange: (b: Modules['branding']) => void;
}) {
  const primary = value.primary_color ?? '#000000';
  const secondary = value.secondary_color ?? '#ffffff';
  const hex = /^#[0-9A-Fa-f]{6}$/;
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 font-semibold">
        {t('admin.modules.branding.logo')}
        <input
          type="url"
          className={box}
          value={value.logo_url ?? ''}
          onChange={(e) => onChange({ ...value, logo_url: e.target.value || null })}
        />
      </label>
      <div className="flex flex-wrap gap-4">
        {(['primary_color', 'secondary_color'] as const).map((field) => (
          <label key={field} className="flex flex-col gap-1 font-semibold">
            {t(
              field === 'primary_color'
                ? 'admin.modules.branding.primary'
                : 'admin.modules.branding.secondary',
            )}
            <span className="flex items-center gap-2">
              <input
                type="color"
                aria-hidden
                tabIndex={-1}
                value={hex.test(value[field] ?? '') ? (value[field] as string) : '#000000'}
                onChange={(e) => onChange({ ...value, [field]: e.target.value })}
              />
              <input
                type="text"
                className={`${box} w-32`}
                value={value[field] ?? ''}
                onChange={(e) => onChange({ ...value, [field]: e.target.value || null })}
              />
            </span>
          </label>
        ))}
      </div>
      <div aria-label={t('admin.modules.branding.preview')} className="flex flex-col gap-1">
        <span className="font-semibold">{t('admin.modules.branding.preview')}</span>
        <div
          data-testid="branding-preview"
          className="flex items-center gap-3 rounded-xl p-3"
          style={{
            backgroundColor: hex.test(primary) ? primary : '#000000',
            color: hex.test(secondary) ? secondary : '#ffffff',
          }}
        >
          {value.logo_url && /^https:\/\//.test(value.logo_url) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.logo_url} alt="" className="h-8 w-8 object-contain" />
          )}
          <strong>{t('admin.modules.branding.previewName')}</strong>
        </div>
      </div>
    </div>
  );
}
