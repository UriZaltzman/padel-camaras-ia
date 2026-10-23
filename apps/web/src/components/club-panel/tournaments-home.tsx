'use client';

import type { ApiClient } from '@app/contracts';
import { Button, Card, DataLabel } from '@app/ui/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { t } from '@/i18n';
import type { MessageKey } from '@/i18n';
import { apiClient } from '@/lib/api/client';
import { CATEGORIES, DEFAULT_POINTS, parseFeeToCents } from '@/lib/club-tournaments/model';
import type { Tournament, TournamentPoints } from '@/lib/club-tournaments/model';
import { formatCents } from '@/lib/player/format';

export const inputClass =
  'min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-night focus:border-court focus:outline-2 focus:outline-court';
export const errorClass = 'border-l-4 border-alert pl-2 text-sm font-semibold text-night';

interface Props {
  clubId: string;
  client?: ApiClient;
}

/** Whether the club has the `tournaments` module on; the panel hides the section when it is off. */
export function useTournamentsEnabled(clubId: string, client: ApiClient) {
  return useQuery({
    queryKey: ['club', clubId],
    queryFn: async () => {
      const { data, error } = await client.GET('/clubs/{id}', { params: { path: { id: clubId } } });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });
}

export function TournamentsHome({ clubId, client = apiClient }: Props) {
  const [wizard, setWizard] = useState(false);
  const club = useTournamentsEnabled(clubId, client);
  const enabled = club.data?.modules.tournaments;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-2">
        <DataLabel label={t('tournaments.title')} />
        <h1 className="font-display text-3xl font-bold">{t('tournaments.title')}</h1>
        <p className="text-ink2">{t('tournaments.lead')}</p>
      </header>
      {club.isPending && <p role="status">{t('tournaments.loading')}</p>}
      {club.isError && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className={errorClass}>{t('tournaments.loadFailed')}</p>
          <Button label={t('tournaments.retry')} onClick={() => void club.refetch()} />
        </div>
      )}
      {enabled === false && (
        <Card>
          <p role="status">{t('tournaments.disabled')}</p>
        </Card>
      )}
      {enabled && wizard && (
        <Wizard clubId={clubId} client={client} onClose={() => setWizard(false)} />
      )}
      {enabled && !wizard && (
        <>
          <Button label={t('tournaments.new')} onClick={() => setWizard(true)} />
          <TournamentList clubId={clubId} client={client} />
        </>
      )}
    </main>
  );
}

function TournamentList({ clubId, client }: { clubId: string; client: ApiClient }) {
  const list = useQuery({
    queryKey: ['club-tournaments', clubId],
    queryFn: async () => {
      const { data, error } = await client.GET('/clubs/{id}/tournaments', {
        params: { path: { id: clubId } },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data.items;
    },
  });
  return (
    <>
      {list.isPending && <p role="status">{t('tournaments.loading')}</p>}
      {list.isError && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className={errorClass}>{t('tournaments.loadFailed')}</p>
          <Button label={t('tournaments.retry')} onClick={() => void list.refetch()} />
        </div>
      )}
      {list.data?.length === 0 && (
        <Card>
          <p role="status">{t('tournaments.empty')}</p>
        </Card>
      )}
      <ul className="flex flex-col gap-3">
        {list.data?.map((item) => (
          <li key={item.id}>
            <TournamentCard clubId={clubId} item={item} />
          </li>
        ))}
      </ul>
    </>
  );
}

function TournamentCard({ clubId, item }: { clubId: string; item: Tournament }) {
  return (
    <Card>
      <div className="flex flex-col gap-1">
        <Link
          href={`/panel/clubes/${clubId}/torneos/${item.id}`}
          aria-label={t('tournaments.open', { name: item.name })}
          className="inline-flex min-h-11 items-center font-display text-xl font-bold text-court underline"
        >
          {item.name}
        </Link>
        <p className="text-sm text-ink2">
          {t('tournaments.category', { n: item.category })} ·{' '}
          {t('tournaments.pairs', { n: item.pair_count })} ·{' '}
          {item.entry_fee_cents === 0
            ? t('tournaments.free')
            : t('tournaments.fee', { amount: formatCents(item.entry_fee_cents) })}
        </p>
        <p className="text-sm font-semibold">
          {t(`tournaments.status.${item.status}` as MessageKey)}
        </p>
      </div>
    </Card>
  );
}

const POINT_KEYS = ['champion', 'finalist', 'semifinal', 'quarterfinal', 'group_win'] as const;
const STEPS = 4;

function Wizard({
  clubId,
  client,
  onClose,
}: {
  clubId: string;
  client: ApiClient;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [fee, setFee] = useState('0');
  const [minutes, setMinutes] = useState('90');
  const [category, setCategory] = useState<number>(4);
  const [points, setPoints] = useState<Record<keyof TournamentPoints, string>>({
    champion: String(DEFAULT_POINTS.champion),
    finalist: String(DEFAULT_POINTS.finalist),
    semifinal: String(DEFAULT_POINTS.semifinal),
    quarterfinal: String(DEFAULT_POINTS.quarterfinal),
    group_win: String(DEFAULT_POINTS.group_win),
  });
  const [invalid, setInvalid] = useState(false);

  const feeCents = parseFeeToCents(fee);
  const minutesN = Number(minutes);
  const pointsN = Object.fromEntries(
    POINT_KEYS.map((k) => [k, Number(points[k])]),
  ) as unknown as TournamentPoints;
  const dataOk =
    name.trim() !== '' &&
    name.length <= 80 &&
    feeCents !== null &&
    Number.isInteger(minutesN) &&
    minutesN >= 30 &&
    minutesN <= 180;
  const pointsOk = POINT_KEYS.every((k) => /^\d{1,4}$/.test(points[k]));

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await client.POST('/clubs/{id}/tournaments', {
        params: { path: { id: clubId } },
        body: {
          name: name.trim(),
          category: category as 1,
          entry_fee_cents: feeCents ?? 0,
          match_minutes: minutesN,
          points: pointsN,
        },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['club-tournaments', clubId] }),
  });

  const next = (e: FormEvent) => {
    e.preventDefault();
    if ((step === 1 && !dataOk) || (step === 3 && !pointsOk)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (step < STEPS) setStep(step + 1);
    else create.mutate();
  };

  if (create.data) {
    return (
      <Card>
        <div className="flex flex-col items-start gap-3">
          <p role="status" className="font-semibold">
            {create.data.name}
          </p>
          <Link
            href={`/panel/clubes/${clubId}/torneos/${create.data.id}`}
            aria-label={t('tournaments.open', { name: create.data.name })}
            className="inline-flex min-h-11 items-center rounded-xl border border-court px-4 font-semibold text-court"
          >
            {t('tournaments.invite.title')}
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <form
      onSubmit={next}
      aria-label={t('tournaments.wizard.title')}
      className="flex flex-col gap-4"
    >
      <h2 className="font-display text-2xl font-bold">{t('tournaments.wizard.title')}</h2>
      <p aria-live="polite" className="font-semibold">
        {t('tournaments.wizard.step', {
          n: step,
          total: STEPS,
          name: t(`tournaments.wizard.step${step}` as MessageKey),
        })}
      </p>
      {step === 1 && (
        <>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {t('tournaments.wizard.name')}
            <input
              className={inputClass}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {t('tournaments.wizard.fee')}
            <input
              className={inputClass}
              inputMode="numeric"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {t('tournaments.wizard.minutes')}
            <input
              className={inputClass}
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
        </>
      )}
      {step === 2 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">{t('tournaments.wizard.category')}</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={`min-h-11 rounded-xl border px-4 font-semibold ${
                  category === c
                    ? 'border-court bg-court text-white'
                    : 'border-line bg-white text-night'
                }`}
              >
                {t('tournaments.category', { n: c })}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {step === 3 && (
        <>
          <p className="text-ink2">{t('tournaments.wizard.format')}</p>
          <p className="text-ink2">{t('tournaments.wizard.courts')}</p>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">{t('tournaments.wizard.points')}</legend>
            {POINT_KEYS.map((k) => (
              <label key={k} className="flex flex-col gap-1 text-sm font-semibold">
                {t(`tournaments.points.${k}` as MessageKey)}
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={points[k]}
                  onChange={(e) => setPoints({ ...points, [k]: e.target.value })}
                />
              </label>
            ))}
          </fieldset>
        </>
      )}
      {step === 4 && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl border border-line bg-white p-4">
          <dt className="text-ink3">{t('tournaments.wizard.name')}</dt>
          <dd className="text-right font-semibold">{name.trim()}</dd>
          <dt className="text-ink3">{t('tournaments.wizard.category')}</dt>
          <dd className="text-right font-semibold">{t('tournaments.category', { n: category })}</dd>
          <dt className="text-ink3">{t('tournaments.wizard.fee')}</dt>
          <dd className="text-right font-semibold">{formatCents(feeCents ?? 0)}</dd>
          <dt className="text-ink3">{t('tournaments.wizard.minutes')}</dt>
          <dd className="text-right font-semibold">{minutesN}</dd>
        </dl>
      )}
      {invalid && (
        <p role="alert" className={errorClass}>
          {t('tournaments.wizard.invalid')}
        </p>
      )}
      {create.isError && (
        <p role="alert" className={errorClass}>
          {t('tournaments.wizard.failed')}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {step > 1 && (
          <Button
            type="button"
            variant="secondary"
            label={t('tournaments.wizard.back')}
            onClick={() => setStep(step - 1)}
          />
        )}
        <Button
          type="submit"
          label={t(step < STEPS ? 'tournaments.wizard.next' : 'tournaments.wizard.create')}
          disabled={create.isPending}
        />
        <Button
          type="button"
          variant="secondary"
          label={t('tournaments.wizard.cancel')}
          onClick={onClose}
        />
      </div>
    </form>
  );
}
