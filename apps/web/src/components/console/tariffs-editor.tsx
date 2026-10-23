'use client';

import type { ApiClient, Schema } from '@app/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { t } from '@/i18n';
import { apiClient } from '@/lib/api/client';
import { formatCents } from '@/lib/player/format';
import { validateTiers, type ModuleKey } from '@/lib/tariffs/model';

type Draft = Schema<'AdminTariffVersionCreate'>;
type Modules = Schema<'AdminModules'>;

const MODULE_KEYS: ModuleKey[] = [
  'deposit',
  'branding_own',
  'lessons_app',
  'ai_video_club_pays',
  'ai_video_player_pays',
  'tournaments',
];

const box =
  'min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-night focus:border-court focus:outline-2 focus:outline-court';

const num = (raw: string) => Math.max(0, Math.trunc(Number(raw)) || 0);

const NO_MODULES: Modules = {
  deposit: { enabled: false, kind: 'percent', percent: null, amount_cents: null },
  branding: { mode: 'generic', logo_url: null, primary_color: null, secondary_color: null },
  lesson_mode: 'whatsapp',
  ai_video: 'off',
  tournaments: false,
};

function Simulator({
  client,
  versions,
  draft,
}: {
  client: ApiClient;
  versions: Schema<'AdminTariffVersion'>[];
  draft: Draft;
}) {
  const [players, setPlayers] = useState(900);
  const [source, setSource] = useState('draft');
  const [modules, setModules] = useState<Modules>(NO_MODULES);
  const simulate = useMutation({
    mutationFn: async () => {
      const { data, error } = await client.POST('/admin/tariffs/simulate', {
        body: {
          active_players: players,
          modules,
          ...(source === 'draft' ? { draft } : { tariff_version_id: source }),
        },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });
  const tier = simulate.data?.tier;

  return (
    <section aria-labelledby="sim-title" className="flex flex-col gap-3">
      <h2 id="sim-title" className="text-lg font-bold">
        {t('admin.sim.title')}
      </h2>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 font-semibold">
          {t('admin.sim.players')}
          <input
            type="number"
            min={0}
            value={players}
            onChange={(e) => setPlayers(num(e.target.value))}
            className={`${box} w-36`}
          />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          {t('admin.sim.version')}
          <select value={source} onChange={(e) => setSource(e.target.value)} className={box}>
            <option value="draft">{t('admin.sim.draft')}</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="font-semibold">{t('admin.sim.modules')}</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-5"
            checked={modules.deposit.enabled}
            onChange={(e) =>
              setModules({
                ...modules,
                deposit: { ...modules.deposit, enabled: e.target.checked, percent: 30 },
              })
            }
          />
          {t('admin.module.deposit')}
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-5"
            checked={modules.branding.mode === 'own'}
            onChange={(e) =>
              setModules({
                ...modules,
                branding: { ...modules.branding, mode: e.target.checked ? 'own' : 'generic' },
              })
            }
          />
          {t('admin.module.branding_own')}
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-5"
            checked={modules.tournaments}
            onChange={(e) => setModules({ ...modules, tournaments: e.target.checked })}
          />
          {t('admin.module.tournaments')}
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-5"
            checked={modules.ai_video === 'club_pays'}
            onChange={(e) =>
              setModules({ ...modules, ai_video: e.target.checked ? 'club_pays' : 'off' })
            }
          />
          {t('admin.module.ai_video_club_pays')}
        </label>
      </fieldset>
      <div>
        <button
          type="button"
          onClick={() => simulate.mutate()}
          disabled={simulate.isPending}
          className="min-h-11 rounded-xl bg-court px-4 font-semibold text-white"
        >
          {t('admin.sim.run')}
        </button>
      </div>
      {simulate.isError && (
        <p role="alert" className="border-l-4 border-alert pl-2 font-semibold">
          {t('admin.sim.error')}
        </p>
      )}
      {simulate.data && tier && (
        <dl className="grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-4">
          <div>
            <dt className="text-sm font-semibold">{t('admin.sim.tier')}</dt>
            <dd data-testid="sim-tier">
              {tier.max_active_players === null
                ? t('admin.tariffs.range.open', { min: tier.min_active_players })
                : t('admin.tariffs.range', {
                    min: tier.min_active_players,
                    max: tier.max_active_players,
                  })}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold">{t('admin.sim.subscription')}</dt>
            <dd>{formatCents(simulate.data.subscription_cents)}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold">{t('admin.sim.modulesTotal')}</dt>
            <dd>{formatCents(simulate.data.modules_cents)}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold">{t('admin.sim.total')}</dt>
            <dd data-testid="sim-total" className="font-bold">
              {formatCents(simulate.data.total_cents)}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

/** SA-07: versioned tariff editor (bands of active players) plus the invoice simulator. */
export function TariffsEditor({ client = apiClient }: { client?: ApiClient }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['admin', 'tariffs'],
    queryFn: async () => {
      const { data, error } = await client.GET('/admin/tariffs', { params: { query: {} } });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });
  const [edits, setEdits] = useState<Draft | null>(null);
  const latest = query.data?.items[0];
  const draft: Draft | null =
    edits ??
    (latest
      ? {
          name: '',
          effective_from: '',
          tiers: latest.tiers,
          module_prices: latest.module_prices,
        }
      : null);

  const publish = useMutation({
    mutationFn: async (body: Draft) => {
      const { data, error } = await client.POST('/admin/tariffs', { body });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
    onSuccess: async () => {
      setEdits(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'tariffs'] });
    },
  });

  if (query.isPending) return <p className="p-4">{t('admin.loading')}</p>;
  if (query.isError || !draft) {
    return (
      <p role="alert" className="m-4 border-l-4 border-alert pl-2 font-semibold">
        {t('admin.error')}
      </p>
    );
  }
  const problem = validateTiers(draft.tiers);
  const canPublish = !problem && draft.name.trim() !== '' && draft.effective_from !== '';
  const update = (next: Partial<Draft>) => setEdits({ ...draft, ...next });
  const setTier = (i: number, patch: Partial<Draft['tiers'][number]>) =>
    update({ tiers: draft.tiers.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const priceOf = (m: ModuleKey) =>
    draft.module_prices.find((p) => p.module === m)?.monthly_cents ?? 0;
  const setPrice = (m: ModuleKey, cents: number) =>
    update({
      module_prices: [
        ...draft.module_prices.filter((p) => p.module !== m),
        ...(cents > 0 ? [{ module: m, monthly_cents: cents }] : []),
      ],
    });

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <h1 className="text-2xl font-bold">{t('admin.tariffs.title')}</h1>
      <p role="note" className="border-l-4 border-alert pl-2 font-semibold">
        {t('admin.tariffs.placeholder')}
      </p>

      <section aria-labelledby="versions-title" className="flex flex-col gap-2">
        <h2 id="versions-title" className="text-lg font-bold">
          {t('admin.tariffs.versions')}
        </h2>
        <ul className="flex flex-col gap-1">
          {query.data.items.map((v) => (
            <li key={v.id}>
              {t('admin.tariffs.version', {
                name: v.name,
                from: v.effective_from,
                clubs: v.clubs_on_version,
              })}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="editor-title" className="flex flex-col gap-3">
        <h2 id="editor-title" className="text-lg font-bold">
          {t('admin.tariffs.editor')}
        </h2>
        <p className="text-sm">{t('admin.tariffs.immutable')}</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 font-semibold">
            {t('admin.tariffs.name')}
            <input
              value={draft.name}
              maxLength={80}
              onChange={(e) => update({ name: e.target.value })}
              className={box}
            />
          </label>
          <label className="flex flex-col gap-1 font-semibold">
            {t('admin.tariffs.from')}
            <input
              type="date"
              value={draft.effective_from}
              onChange={(e) => update({ effective_from: e.target.value })}
              className={box}
            />
          </label>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col">{t('admin.tariffs.col.min')}</th>
              <th scope="col">{t('admin.tariffs.col.max')}</th>
              <th scope="col">{t('admin.tariffs.col.price')}</th>
              <th scope="col">
                <span className="sr-only">{t('admin.tariffs.col.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {draft.tiers.map((tier, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1">
                  <input
                    type="number"
                    min={0}
                    aria-label={t('admin.tariffs.tierMin', { n: i + 1 })}
                    value={tier.min_active_players}
                    onChange={(e) => setTier(i, { min_active_players: num(e.target.value) })}
                    className={`${box} w-28`}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    placeholder={t('admin.tariffs.noLimit')}
                    aria-label={t('admin.tariffs.tierMax', { n: i + 1 })}
                    value={tier.max_active_players ?? ''}
                    onChange={(e) =>
                      setTier(i, {
                        max_active_players: e.target.value === '' ? null : num(e.target.value),
                      })
                    }
                    className={`${box} w-28`}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    aria-label={t('admin.tariffs.tierPrice', { n: i + 1 })}
                    value={tier.monthly_cents / 100}
                    onChange={(e) => setTier(i, { monthly_cents: num(e.target.value) * 100 })}
                    className={`${box} w-36`}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="min-h-11 px-2 font-semibold underline"
                    onClick={() => update({ tiers: draft.tiers.filter((_, j) => j !== i) })}
                  >
                    {t('admin.tariffs.removeTier')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-line px-3 font-semibold"
            onClick={() => {
              const last = draft.tiers[draft.tiers.length - 1];
              const start = last ? (last.max_active_players ?? last.min_active_players) + 1 : 0;
              update({
                tiers: [
                  ...draft.tiers.map((x, j) =>
                    j === draft.tiers.length - 1 && x.max_active_players === null
                      ? { ...x, max_active_players: start + 99 }
                      : x,
                  ),
                  {
                    min_active_players: start + (last?.max_active_players === null ? 100 : 0),
                    max_active_players: null,
                    monthly_cents: 0,
                  },
                ],
              });
            }}
          >
            {t('admin.tariffs.addTier')}
          </button>
        </div>
        {problem && (
          <p role="alert" className="border-l-4 border-alert pl-2 font-semibold">
            {t(`admin.tariffs.problem.${problem}`)}
          </p>
        )}

        <h3 className="font-bold">{t('admin.tariffs.modules')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {MODULE_KEYS.map((m) => (
            <label key={m} className="flex flex-col gap-1 font-semibold">
              {t(`admin.module.${m}`)}
              <input
                type="number"
                min={0}
                value={priceOf(m) / 100}
                onChange={(e) => setPrice(m, num(e.target.value) * 100)}
                className={`${box} w-40`}
              />
            </label>
          ))}
        </div>

        {publish.isError && (
          <p role="alert" className="border-l-4 border-alert pl-2 font-semibold">
            {t('admin.tariffs.publishError')}
          </p>
        )}
        {publish.isSuccess && <p role="status">{t('admin.tariffs.published')}</p>}
        <div>
          <button
            type="button"
            disabled={!canPublish || publish.isPending}
            onClick={() => publish.mutate(draft)}
            className="min-h-11 rounded-xl bg-court px-4 font-semibold text-white disabled:opacity-50"
          >
            {t('admin.tariffs.publish')}
          </button>
        </div>
      </section>

      <Simulator client={client} versions={query.data.items} draft={draft} />
    </main>
  );
}
