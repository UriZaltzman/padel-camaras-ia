'use client';

import type { ApiClient, Schema } from '@app/contracts';
import { Button, Card, DataLabel } from '@app/ui/web';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useId, useMemo, useState } from 'react';

import { t } from '@/i18n';
import type { MessageKey } from '@/i18n';
import { apiClient } from '@/lib/api/client';
import { addDays, hourRange } from '@/lib/club-calendar/model';
import {
  blocksByDay,
  bookedMinutesByDay,
  heatLevel,
  leadingBlanks,
  localInstant,
  monthDates,
  monthStart,
  occupancy,
  orderedRange,
} from '@/lib/club-calendar/year';
import { formatCents, formatDateTime, todayLocal } from '@/lib/player/format';

const inputClass =
  'min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-night focus:border-court focus:outline-2 focus:outline-court';
const errorClass = 'border-l-4 border-alert pl-2 text-sm font-semibold text-night';
// Five steps of the same hue plus the percentage in the label: color is never the only signal.
const heatClass = [
  'bg-white text-night',
  'bg-court/15 text-night',
  'bg-court/35 text-night',
  'bg-court/65 text-white',
  'bg-court text-white',
];
const KINDS: Schema<'CourtBlockKind'>[] = ['maintenance', 'holiday', 'closure'];
const POLICIES: Schema<'BlockBookingsPolicy'>[] = ['cancel_and_refund', 'move', 'abort'];
const monthName = new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' });
const dayName = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Argentina/Buenos_Aires',
});

interface Props {
  clubId: string;
  client?: ApiClient;
  /** Today's date `YYYY-MM-DD`; tests pin it. */
  today?: string;
}

async function loadMonth(client: ApiClient, clubId: string, year: number, month: number) {
  const from = localInstant(monthStart(year, month), '00:00');
  const to = localInstant(monthStart(month === 11 ? year + 1 : year, (month + 1) % 12), '00:00');
  const items: Schema<'ClubBooking'>[] = [];
  let cursor: string | undefined;
  do {
    const { data, error } = await client.GET('/club-admin/bookings', {
      params: { query: { club_id: clubId, from, to, limit: 50, ...(cursor ? { cursor } : {}) } },
    });
    if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
    items.push(...data.items);
    cursor = data.next_cursor ?? undefined;
  } while (cursor);
  return items;
}

export function YearCalendar({ clubId, client = apiClient, today = todayLocal() }: Props) {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [anchor, setAnchor] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [modal, setModal] = useState<'block' | 'holidays' | null>(null);
  const [lastResult, setLastResult] = useState<Schema<'CourtBlockResult'> | null>(null);

  const club = useQuery({
    queryKey: ['club', clubId],
    queryFn: async () => {
      const { data, error } = await client.GET('/clubs/{id}', { params: { path: { id: clubId } } });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });
  const blocks = useQuery({
    queryKey: ['club-blocks', clubId, year],
    queryFn: async () => {
      const { data, error } = await client.GET('/clubs/{id}/court-blocks', {
        params: {
          path: { id: clubId },
          query: {
            from: localInstant(monthStart(year, 0), '00:00'),
            to: localInstant(monthStart(year + 1, 0), '00:00'),
          },
        },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });
  const months = useQueries({
    queries: Array.from({ length: 12 }, (_unused, month) => ({
      queryKey: ['club-bookings', clubId, 'month', year, month],
      queryFn: () => loadMonth(client, clubId, year, month),
    })),
  });

  const courts = useMemo(() => club.data?.courts ?? [], [club.data]);
  const hours = hourRange(courts);
  const booked = useMemo(() => bookedMinutesByDay(months.flatMap((m) => m.data ?? [])), [months]);
  const blocked = useMemo(() => blocksByDay(blocks.data ?? []), [blocks.data]);

  const pick = (date: string) => {
    if (!anchor) {
      setAnchor(date);
      setRange({ from: date, to: date });
    } else {
      setRange(orderedRange(anchor, date));
      setAnchor(null);
    }
  };

  const remove = useMutation({
    mutationFn: async (blockId: string) => {
      const { error } = await client.DELETE('/clubs/{id}/court-blocks/{block_id}', {
        params: { path: { id: clubId, block_id: blockId } },
      });
      if (error) throw new Error(error.code);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['club-blocks', clubId] }),
  });

  const courtName = (id: string) => courts.find((c) => c.id === id)?.name ?? '';
  const failed = club.isError || blocks.isError || months.some((m) => m.isError);
  const ready = club.data && blocks.data;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-2">
        {club.data && <DataLabel label={club.data.name} />}
        <h1 className="font-display text-3xl font-bold">{t('yearCal.title')}</h1>
        <p className="text-ink2">{t('yearCal.lead')}</p>
        <Link
          href={`/panel/clubes/${clubId}/calendario`}
          className="min-h-11 self-start py-2 font-semibold text-court underline"
        >
          {t('yearCal.backToDays')}
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Button label={t('yearCal.prevYear')} onClick={() => setYear(year - 1)} />
        <h2 className="font-display text-2xl font-bold" aria-live="polite">
          {year}
        </h2>
        <Button label={t('yearCal.nextYear')} onClick={() => setYear(year + 1)} />
        <Button label={t('yearCal.importHolidays')} onClick={() => setModal('holidays')} />
      </div>

      <ul aria-label={t('yearCal.legend')} className="flex flex-wrap gap-3 text-sm">
        {heatClass.map((cls, level) => (
          <li key={level} className="flex items-center gap-2">
            <span className={`h-4 w-4 rounded border border-line ${cls}`} aria-hidden />
            {t(`yearCal.heat.${level}` as MessageKey)}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="h-4 w-4 rounded border-2 border-dashed border-night" aria-hidden />
          {t('yearCal.blockedLegend')}
        </li>
      </ul>

      {(club.isPending || blocks.isPending) && <p role="status">{t('yearCal.loading')}</p>}
      {failed && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className={errorClass}>{t('yearCal.loadFailed')}</p>
          <Button
            label={t('calendar.retry')}
            onClick={() => {
              void club.refetch();
              void blocks.refetch();
              months.forEach((m) => void m.refetch());
            }}
          />
        </div>
      )}

      {ready && (
        <>
          <div className="flex flex-wrap items-center gap-3" role="group">
            <p role="status" className="font-semibold">
              {range
                ? t(range.from === range.to ? 'yearCal.selectedOne' : 'yearCal.selectedRange', {
                    from: dayName.format(new Date(`${range.from}T12:00:00-03:00`)),
                    to: dayName.format(new Date(`${range.to}T12:00:00-03:00`)),
                  })
                : t('yearCal.pickHint')}
            </p>
            <Button
              label={t('yearCal.blockSelection')}
              disabled={!range || anchor !== null}
              onClick={() => setModal('block')}
            />
            <Button
              label={t('yearCal.newBlock')}
              onClick={() => {
                setRange(range ?? { from: today, to: today });
                setAnchor(null);
                setModal('block');
              }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 12 }, (_unused, month) => (
              <Card key={month}>
                <section
                  aria-label={`${monthName.format(new Date(Date.UTC(year, month, 1)))} ${year}`}
                >
                  <h3 className="mb-2 font-display text-lg font-bold capitalize">
                    {monthName.format(new Date(Date.UTC(year, month, 1)))}
                  </h3>
                  <div className="grid grid-cols-7 gap-1 text-center text-xs">
                    {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                      <span key={i} aria-hidden className="text-ink3">
                        {d}
                      </span>
                    ))}
                    {Array.from({ length: leadingBlanks(year, month) }, (_u, i) => (
                      <span key={`b${i}`} />
                    ))}
                    {monthDates(year, month).map((date) => {
                      const ratio = occupancy(
                        booked.get(date) ?? 0,
                        courts.length,
                        hours.end - hours.start,
                      );
                      const dayBlocks = blocked.get(date) ?? [];
                      const inRange = range && date >= range.from && date <= range.to;
                      return (
                        <button
                          key={date}
                          type="button"
                          aria-pressed={Boolean(inRange)}
                          aria-label={t('yearCal.day.aria', {
                            day: dayName.format(new Date(`${date}T12:00:00-03:00`)),
                            percent: Math.round(ratio * 100),
                            blocks: dayBlocks.length,
                          })}
                          onClick={() => pick(date)}
                          className={`min-h-9 rounded text-xs font-semibold focus:outline-2 focus:outline-night ${heatClass[heatLevel(ratio)]} ${
                            dayBlocks.length > 0
                              ? 'border-2 border-dashed border-night'
                              : 'border border-line'
                          } ${inRange ? 'ring-2 ring-ball ring-offset-1' : ''} ${date === today ? 'underline' : ''}`}
                        >
                          {Number(date.slice(8))}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </Card>
            ))}
          </div>

          <section aria-labelledby="block-list" className="flex flex-col gap-2">
            <h2 id="block-list" className="font-display text-2xl font-bold">
              {t('yearCal.list.title')}
            </h2>
            {lastResult && (
              <p role="status" className="font-semibold">
                {t('yearCal.result', {
                  blocks: lastResult.blocks.length,
                  cancelled: lastResult.cancelled_booking_ids.length,
                  refund: formatCents(lastResult.refunded_cents),
                })}
              </p>
            )}
            {remove.isError && (
              <p role="alert" className={errorClass}>
                {t('yearCal.list.removeFailed')}
              </p>
            )}
            {blocks.data.length === 0 ? (
              <p>{t('yearCal.list.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {blocks.data.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3"
                  >
                    <span className="font-semibold">{courtName(b.court_id)}</span>
                    <span>
                      {formatDateTime(b.starts_at)} → {formatDateTime(b.ends_at)}
                    </span>
                    <span className="text-ink2">
                      {t(`yearCal.kind.${b.kind}` as MessageKey)}
                      {b.reason ? ` · ${b.reason}` : ''}
                      {b.series_id ? ` · ${t('yearCal.list.series')}` : ''}
                    </span>
                    <Button
                      label={t('yearCal.list.remove')}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(b.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {modal && (
        <BlockModal
          key={modal}
          mode={modal}
          client={client}
          clubId={clubId}
          courts={courts}
          year={year}
          initial={range ?? { from: today, to: today }}
          onClose={() => setModal(null)}
          onDone={async (result) => {
            setLastResult(result);
            setModal(null);
            setRange(null);
            await queryClient.invalidateQueries({ queryKey: ['club-blocks', clubId] });
            await queryClient.invalidateQueries({ queryKey: ['club-bookings', clubId] });
          }}
        />
      )}
    </main>
  );
}

interface ModalProps {
  mode: 'block' | 'holidays';
  client: ApiClient;
  clubId: string;
  courts: Schema<'Court'>[];
  year: number;
  initial: { from: string; to: string };
  onClose: () => void;
  onDone: (result: Schema<'CourtBlockResult'>) => Promise<void>;
}

function BlockModal({ mode, client, clubId, courts, year, initial, onClose, onDone }: ModalProps) {
  const titleId = useId();
  const [courtIds, setCourtIds] = useState<string[]>(courts.map((c) => c.id));
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('24:00');
  const [kind, setKind] = useState<Schema<'CourtBlockKind'>>('maintenance');
  const [reason, setReason] = useState('');
  const [frequency, setFrequency] = useState<'none' | 'daily' | 'weekly'>('none');
  const [until, setUntil] = useState(addDays(initial.to, 7));
  const [policy, setPolicy] = useState<Schema<'BlockBookingsPolicy'>>('abort');
  const [importYear, setImportYear] = useState(year);
  const holidays = mode === 'holidays';
  const valid =
    courtIds.length > 0 && (holidays || (to >= from && (frequency === 'none' || until > to)));

  const save = useMutation({
    mutationFn: async () => {
      if (holidays) {
        const { data, error } = await client.POST('/clubs/{id}/court-blocks/holidays', {
          params: { path: { id: clubId } },
          body: { year: importYear, court_ids: courtIds, existing_bookings_policy: policy },
        });
        if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
        return data;
      }
      const { data, error } = await client.POST('/clubs/{id}/court-blocks', {
        params: { path: { id: clubId } },
        body: {
          court_ids: courtIds,
          starts_at: localInstant(from, allDay ? '00:00' : startTime),
          ends_at: localInstant(allDay ? to : to, allDay ? '24:00' : endTime),
          kind,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(frequency !== 'none' ? { recurrence: { frequency, until } } : {}),
          existing_bookings_policy: policy,
        },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
    onSuccess: onDone,
  });
  const conflict = save.error?.message === 'BOOKING_SLOT_TAKEN';

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center overflow-y-auto bg-night/60 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <h2 id={titleId} className="font-display text-2xl font-bold">
          {t(holidays ? 'yearCal.holidays.title' : 'yearCal.modal.title')}
        </h2>
        {holidays && <p className="text-ink2">{t('yearCal.holidays.lead')}</p>}

        <fieldset className="flex flex-col gap-1">
          <legend className="font-semibold">{t('yearCal.modal.courts')}</legend>
          {courts.map((c) => (
            <label key={c.id} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={courtIds.includes(c.id)}
                onChange={(e) =>
                  setCourtIds(
                    e.target.checked ? [...courtIds, c.id] : courtIds.filter((id) => id !== c.id),
                  )
                }
              />
              {c.name}
            </label>
          ))}
        </fieldset>

        {holidays ? (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {t('yearCal.holidays.year')}
            <input
              type="number"
              className={inputClass}
              min={2026}
              max={2100}
              value={importYear}
              onChange={(e) => setImportYear(Number(e.target.value))}
            />
          </label>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm font-semibold">
                {t('yearCal.modal.from')}
                <input
                  type="date"
                  className={inputClass}
                  value={from}
                  onChange={(e) => e.target.value && setFrom(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                {t('yearCal.modal.to')}
                <input
                  type="date"
                  className={inputClass}
                  value={to}
                  onChange={(e) => e.target.value && setTo(e.target.value)}
                />
              </label>
            </div>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              {t('yearCal.modal.allDay')}
            </label>
            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  {t('yearCal.modal.startTime')}
                  <input
                    type="time"
                    className={inputClass}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  {t('yearCal.modal.endTime')}
                  <input
                    type="time"
                    className={inputClass}
                    value={endTime === '24:00' ? '23:59' : endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </label>
              </div>
            )}
            <label className="flex flex-col gap-1 text-sm font-semibold">
              {t('yearCal.modal.kind')}
              <select
                className={inputClass}
                value={kind}
                onChange={(e) => setKind(e.target.value as Schema<'CourtBlockKind'>)}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`yearCal.kind.${k}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              {t('yearCal.modal.reason')}
              <input
                type="text"
                maxLength={200}
                className={inputClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm font-semibold">
                {t('yearCal.modal.recurrence')}
                <select
                  className={inputClass}
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as typeof frequency)}
                >
                  <option value="none">{t('yearCal.recurrence.none')}</option>
                  <option value="daily">{t('yearCal.recurrence.daily')}</option>
                  <option value="weekly">{t('yearCal.recurrence.weekly')}</option>
                </select>
              </label>
              {frequency !== 'none' && (
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  {t('yearCal.modal.until')}
                  <input
                    type="date"
                    className={inputClass}
                    value={until}
                    onChange={(e) => e.target.value && setUntil(e.target.value)}
                  />
                </label>
              )}
            </div>
          </>
        )}

        <fieldset className="flex flex-col gap-1">
          <legend className="font-semibold">{t('yearCal.modal.policy')}</legend>
          {POLICIES.map((p) => (
            <label key={p} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="policy"
                checked={policy === p}
                onChange={() => setPolicy(p)}
              />
              {t(`yearCal.policy.${p}` as MessageKey)}
            </label>
          ))}
        </fieldset>

        {save.isError && (
          <p role="alert" className={errorClass}>
            {t(conflict ? 'yearCal.modal.conflict' : 'yearCal.modal.failed')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            label={t(holidays ? 'yearCal.holidays.confirm' : 'yearCal.modal.confirm')}
            disabled={!valid || save.isPending}
          />
          <Button label={t('yearCal.modal.cancel')} onClick={onClose} />
        </div>
      </form>
    </div>
  );
}
