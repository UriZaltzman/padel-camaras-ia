'use client';

import type { ApiClient, Schema } from '@app/contracts';
import { Button, Card, DataLabel } from '@app/ui/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';

import { t } from '@/i18n';
import { apiClient } from '@/lib/api/client';
import {
  DEPOSIT_TYPES,
  DURATIONS,
  START_INTERVALS,
  TIME_OPTIONS,
  WEEKDAYS,
  courtToForm,
  newBand,
  newRule,
  toCourtSettingsUpdate,
  validateCourtForm,
  type BandForm,
  type CourtForm,
  type Duration,
  type RuleForm,
} from '@/lib/club-settings/form';

// TODO(web-paneles): move field styles to packages/ui once shared form components land there.
const inputClass =
  'min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-night focus:border-court focus:outline-2 focus:outline-court';
// Orange on white does not reach AA for text, so errors are night text with an alert marker.
const errorClass = 'border-l-4 border-alert pl-2 text-sm font-semibold text-night';
const checkClass = 'flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-3';

interface Props {
  clubId: string;
  /** Typed API client; tests pass one with their own fetch. */
  client?: ApiClient;
}

export function CourtSettingsPanel({ clubId, client = apiClient }: Props) {
  const queryKey = ['club', clubId];
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await client.GET('/clubs/{id}', { params: { path: { id: clubId } } });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        {query.data && <DataLabel label={query.data.name} />}
        <h1 className="font-display text-3xl font-bold">{t('courts.title')}</h1>
        <p className="text-ink2">{t('courts.lead')}</p>
      </header>
      {query.isPending && <p role="status">{t('courts.loading')}</p>}
      {query.isError && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className={errorClass}>{t('courts.loadFailed')}</p>
          <Button label={t('courts.retry')} onClick={() => void query.refetch()} />
        </div>
      )}
      {query.data && (
        <Editor key={query.data.id} club={query.data} client={client} queryKey={queryKey} />
      )}
    </main>
  );
}

function Editor({
  club,
  client,
  queryKey,
}: {
  club: Schema<'Club'>;
  client: ApiClient;
  queryKey: string[];
}) {
  const queryClient = useQueryClient();
  const [courts, setCourts] = useState<CourtForm[]>(() => club.courts.map(courtToForm));
  const [selected, setSelected] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const selectId = useId();

  const save = useMutation({
    mutationFn: async (body: Schema<'ClubSettingsUpdate'>) => {
      const { data, error } = await client.PATCH('/clubs/{id}/settings', {
        params: { path: { id: club.id } },
        body,
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  });

  const court = courts[selected];
  if (!court) return null;

  const updateCourt = (change: (draft: CourtForm) => CourtForm) => {
    save.reset();
    setCourts((all) => all.map((c, i) => (i === selected ? change(c) : c)));
  };
  const updateRule = (r: number, change: (rule: RuleForm) => RuleForm) =>
    updateCourt((c) => ({
      ...c,
      rules: c.rules.map((rule, i) => (i === r ? change(rule) : rule)),
    }));

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const found = courts.flatMap(validateCourtForm);
    setErrors(found);
    if (found.length > 0) return;
    if (courts.length === 0) return;
    save.mutate({ courts: courts.map(toCourtSettingsUpdate) });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor={selectId} className="font-semibold">
          {t('courts.selectCourt')}
        </label>
        <select
          id={selectId}
          className={inputClass}
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
        >
          {courts.map((c, i) => (
            <option key={c.courtId} value={i}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="rules-title">
        <h2 id="rules-title" className="font-display text-2xl font-bold">
          {t('courts.rules.title')}
        </h2>
        {court.rules.length === 0 && <p className="text-ink2">{t('courts.rules.empty')}</p>}
        {court.rules.map((rule, r) => (
          <RuleEditor
            key={r}
            index={r}
            rule={rule}
            onChange={(change) => updateRule(r, change)}
            onRemove={() =>
              updateCourt((c) => ({ ...c, rules: c.rules.filter((_, i) => i !== r) }))
            }
          />
        ))}
        <div>
          <Button
            variant="secondary"
            label={t('courts.rule.add')}
            onClick={() => updateCourt((c) => ({ ...c, rules: [...c.rules, newRule()] }))}
          />
        </div>
      </section>

      <Card>
        <fieldset className="flex flex-col gap-3">
          <legend className="font-display text-xl font-bold">{t('courts.deposit.title')}</legend>
          <div className="flex flex-wrap gap-2">
            {DEPOSIT_TYPES.map((type) => (
              <label key={type} className={checkClass}>
                <input
                  type="radio"
                  name={`deposit-${court.courtId}`}
                  checked={court.depositType === type}
                  onChange={() => updateCourt((c) => ({ ...c, depositType: type }))}
                />
                {t(`courts.deposit.${type}`)}
              </label>
            ))}
          </div>
          {court.depositType === 'percent' && (
            <Field label={t('courts.deposit.percentValue')}>
              {(id) => (
                <input
                  id={id}
                  inputMode="numeric"
                  className={inputClass}
                  value={court.depositPercent}
                  onChange={(e) => updateCourt((c) => ({ ...c, depositPercent: e.target.value }))}
                />
              )}
            </Field>
          )}
          {court.depositType === 'fixed' && (
            <Field label={t('courts.deposit.amountValue')}>
              {(id) => (
                <input
                  id={id}
                  inputMode="decimal"
                  className={inputClass}
                  value={court.depositPesos}
                  onChange={(e) => updateCourt((c) => ({ ...c, depositPesos: e.target.value }))}
                />
              )}
            </Field>
          )}
        </fieldset>
      </Card>

      <Card>
        {/* Per court as the contract says today (`CourtBookingSettings.cancellation_refund_hours`).
            Decision #242 may move it to the club; then this field moves out of the court card. */}
        <fieldset className="flex flex-col gap-3">
          <legend className="font-display text-xl font-bold">
            {t('courts.cancellation.title')}
          </legend>
          <Field label={t('courts.cancellation.hours')}>
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                className={inputClass}
                value={court.cancellationHours}
                onChange={(e) => updateCourt((c) => ({ ...c, cancellationHours: e.target.value }))}
              />
            )}
          </Field>
        </fieldset>
      </Card>

      {errors.length > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-white p-4">
          <p className="font-semibold">{t('courts.errors.title')}</p>
          <ul className="flex flex-col gap-1">
            {errors.map((message) => (
              <li key={message} className={errorClass}>
                {message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {save.isSuccess && (
        <p role="status" className="rounded-xl bg-court px-4 py-3 font-semibold text-white">
          {t('courts.saved')}
        </p>
      )}
      {save.isError && (
        <p role="alert" className={errorClass}>
          {t('courts.saveFailed')}
        </p>
      )}
      <div>
        <Button
          type="submit"
          label={save.isPending ? t('courts.saving') : t('courts.save')}
          disabled={save.isPending}
        />
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function TimeSelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  return (
    <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {TIME_OPTIONS.map((time) => (
        <option key={time} value={time}>
          {time}
        </option>
      ))}
    </select>
  );
}

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function RuleEditor({
  index,
  rule,
  onChange,
  onRemove,
}: {
  index: number;
  rule: RuleForm;
  onChange: (change: (rule: RuleForm) => RuleForm) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  const updateBand = (b: number, change: Partial<BandForm>) =>
    onChange((r) => ({
      ...r,
      bands: r.bands.map((band, i) => (i === b ? { ...band, ...change } : band)),
    }));

  return (
    <Card>
      <fieldset className="flex flex-col gap-4">
        <legend className="font-display text-xl font-bold">{t('courts.rule.label', { n })}</legend>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">{t('courts.rule.days')}</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <label key={day} className={checkClass}>
                <input
                  type="checkbox"
                  checked={rule.days.includes(day)}
                  onChange={() => onChange((r) => ({ ...r, days: toggle(r.days, day) }))}
                />
                {t(`courts.day.${day}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t('courts.rule.opensAt')}>
            {(id) => (
              <TimeSelect
                id={id}
                value={rule.opensAt}
                onChange={(opensAt) => onChange((r) => ({ ...r, opensAt }))}
              />
            )}
          </Field>
          <Field label={t('courts.rule.closesAt')}>
            {(id) => (
              <TimeSelect
                id={id}
                value={rule.closesAt}
                onChange={(closesAt) => onChange((r) => ({ ...r, closesAt }))}
              />
            )}
          </Field>
          <Field label={t('courts.rule.interval')}>
            {(id) => (
              <select
                id={id}
                className={inputClass}
                value={rule.startInterval}
                onChange={(e) =>
                  onChange((r) => ({
                    ...r,
                    startInterval: Number(e.target.value) as RuleForm['startInterval'],
                  }))
                }
              >
                {START_INTERVALS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {t('courts.minutes', { n: minutes })}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">{t('courts.rule.durations')}</legend>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((duration) => (
              <label key={duration} className={checkClass}>
                <input
                  type="checkbox"
                  checked={rule.allowedDurations.includes(duration)}
                  onChange={() =>
                    onChange((r) => ({
                      ...r,
                      allowedDurations: toggle(r.allowedDurations, duration),
                    }))
                  }
                />
                {t('courts.minutes', { n: duration })}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-semibold">{t('courts.band.title')}</legend>
          {rule.bands.map((band, b) => (
            <fieldset key={b} className="flex flex-col gap-3 rounded-xl border border-line p-3">
              <legend className="px-1 font-semibold">{t('courts.band.label', { n: b + 1 })}</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Field label={t('courts.band.startsAt')}>
                  {(id) => (
                    <TimeSelect
                      id={id}
                      value={band.startsAt}
                      onChange={(startsAt) => updateBand(b, { startsAt })}
                    />
                  )}
                </Field>
                <Field label={t('courts.band.endsAt')}>
                  {(id) => (
                    <TimeSelect
                      id={id}
                      value={band.endsAt}
                      onChange={(endsAt) => updateBand(b, { endsAt })}
                    />
                  )}
                </Field>
                {DURATIONS.filter((d) => rule.allowedDurations.includes(d)).map((d: Duration) => (
                  <Field key={d} label={t('courts.band.price', { n: d })}>
                    {(id) => (
                      <input
                        id={id}
                        inputMode="decimal"
                        className={inputClass}
                        value={band.prices[d]}
                        onChange={(e) =>
                          updateBand(b, { prices: { ...band.prices, [d]: e.target.value } })
                        }
                      />
                    )}
                  </Field>
                ))}
              </div>
              {rule.bands.length > 1 && (
                <div>
                  <Button
                    variant="secondary"
                    label={t('courts.band.remove', { n: b + 1 })}
                    onClick={() =>
                      onChange((r) => ({ ...r, bands: r.bands.filter((_, i) => i !== b) }))
                    }
                  />
                </div>
              )}
            </fieldset>
          ))}
          <div>
            <Button
              variant="secondary"
              label={t('courts.band.add')}
              onClick={() =>
                onChange((r) => {
                  const last = r.bands[r.bands.length - 1];
                  return {
                    ...r,
                    bands: [...r.bands, newBand(last?.endsAt ?? r.opensAt, r.closesAt)],
                  };
                })
              }
            />
          </div>
        </fieldset>

        <div>
          <Button variant="secondary" label={t('courts.rule.remove', { n })} onClick={onRemove} />
        </div>
      </fieldset>
    </Card>
  );
}
