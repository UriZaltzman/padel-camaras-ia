'use client';

import type { ApiClient, Schema } from '@app/contracts';
import { Button, Card, DataLabel, Sheet, useVisibleCourts } from '@app/ui/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { t } from '@/i18n';
import type { MessageKey } from '@/i18n';
import { apiClient } from '@/lib/api/client';
import {
  SLOT_STATES,
  addDays,
  bookingState,
  bookingsOn,
  hourRange,
  minutesIntoDay,
  visibleRange,
  weekDates,
  type CalendarView,
  type SlotState,
} from '@/lib/club-calendar/model';
import { formatCents, formatTime, todayLocal } from '@/lib/player/format';

const HOUR_PX = 56;
// "Real time" for now: the contract has no club-level channel (the court channel is for the app
// and the device), so the grid refetches every few seconds and when the tab regains focus.
const REFRESH_MS = 15_000;
const inputClass =
  'min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-night focus:border-court focus:outline-2 focus:outline-court';
// Every state also has a text label, so color is never the only signal.
const stateClass: Record<SlotState, string> = {
  deposit: 'bg-ball text-night',
  paid: 'bg-court text-white',
  manual: 'bg-ink2 text-white',
  blocked: 'bg-line text-night',
};
const errorClass = 'border-l-4 border-alert pl-2 text-sm font-semibold text-night';

interface Props {
  clubId: string;
  client?: ApiClient;
  /** Today's date `YYYY-MM-DD`; tests pin it. */
  today?: string;
}

async function loadBookings(client: ApiClient, clubId: string, view: CalendarView, date: string) {
  const { from, to } = visibleRange(date, view);
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

export function BookingCalendar({ clubId, client = apiClient, today = todayLocal() }: Props) {
  const [view, setView] = useState<CalendarView>('day');
  const [date, setDate] = useState(today);
  const [courtId, setCourtId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Schema<'ClubBooking'> | null>(null);

  const club = useQuery({
    queryKey: ['club', clubId],
    queryFn: async () => {
      const { data, error } = await client.GET('/clubs/{id}', { params: { path: { id: clubId } } });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });
  const bookings = useQuery({
    queryKey: ['club-bookings', clubId, view, date],
    queryFn: () => loadBookings(client, clubId, view, date),
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  const courts = club.data?.courts ?? [];
  const weekCourt = courts.find((c) => c.id === courtId) ?? courts[0];
  const step = view === 'day' ? 1 : 7;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-2">
        {club.data && <DataLabel label={club.data.name} />}
        <h1 className="font-display text-3xl font-bold">{t('calendar.title')}</h1>
        <p className="text-ink2">{t('calendar.lead')}</p>
        <Link
          href={`/panel/clubes/${clubId}/calendario/anual`}
          className="min-h-11 self-start py-2 font-semibold text-court underline"
        >
          {t('yearCal.open')}
        </Link>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label={t('calendar.view')} className="flex gap-2">
          {(['day', 'week'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`min-h-11 rounded-xl border px-4 font-semibold ${
                view === v ? 'border-court bg-court text-white' : 'border-line bg-white text-night'
              }`}
            >
              {t(v === 'day' ? 'calendar.view.day' : 'calendar.view.week')}
            </button>
          ))}
        </div>
        <Button label={t('calendar.prev')} onClick={() => setDate(addDays(date, -step))} />
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('calendar.date')}
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
        <Button label={t('calendar.next')} onClick={() => setDate(addDays(date, step))} />
        <Button label={t('calendar.today')} onClick={() => setDate(today)} />
        {view === 'week' && courts.length > 0 && (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {t('calendar.court')}
            <select
              className={inputClass}
              value={weekCourt?.id}
              onChange={(e) => setCourtId(e.target.value)}
            >
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <Legend />

      {(club.isPending || bookings.isPending) && <p role="status">{t('calendar.loading')}</p>}
      {(club.isError || bookings.isError) && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className={errorClass}>{t('calendar.loadFailed')}</p>
          <Button
            label={t('calendar.retry')}
            onClick={() => {
              void club.refetch();
              void bookings.refetch();
            }}
          />
        </div>
      )}
      {club.data && bookings.data && (
        <Grid
          courts={courts}
          bookings={bookings.data}
          view={view}
          date={date}
          weekCourtId={weekCourt?.id}
          isToday={date === today}
          onSelect={setSelected}
        />
      )}
      <p className="text-sm text-ink3">{t('calendar.live')}</p>

      {selected && (
        <BookingDetail
          key={selected.id}
          booking={selected}
          client={client}
          clubId={clubId}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}

function Legend() {
  return (
    <ul aria-label={t('calendar.legend')} className="flex flex-wrap gap-3 text-sm">
      <li className="flex items-center gap-2">
        <span className="h-4 w-4 rounded border border-line bg-white" aria-hidden />
        {t('calendar.state.free')}
      </li>
      {SLOT_STATES.map((s) => (
        <li key={s} className="flex items-center gap-2">
          <span className={`h-4 w-4 rounded ${stateClass[s]}`} aria-hidden />
          {t(`calendar.state.${s}` as MessageKey)}
        </li>
      ))}
    </ul>
  );
}

interface GridProps {
  courts: Schema<'Court'>[];
  bookings: Schema<'ClubBooking'>[];
  view: CalendarView;
  date: string;
  weekCourtId: string | undefined;
  isToday: boolean;
  onSelect: (booking: Schema<'ClubBooking'>) => void;
}

const dayLabel = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  weekday: 'short',
  day: 'numeric',
});

function Grid({ courts, bookings, view, date, weekCourtId, isToday, onSelect }: GridProps) {
  const { start, end } = hourRange(courts);
  // Booking-grid rule: one court on a phone, two or three on a tablet, all from the laptop up.
  const perScreen = useVisibleCourts(courts.length);
  const [firstCourt, setFirstCourt] = useState(0);
  const first = Math.max(0, Math.min(firstCourt, courts.length - perScreen));
  const shownCourts = view === 'day' ? courts.slice(first, first + perScreen) : courts;
  const hours = Array.from({ length: end - start }, (_unused, i) => start + i);
  const columns =
    view === 'day'
      ? shownCourts.map((c) => ({
          key: c.id,
          label: c.name,
          day: date,
          court: c.id,
          closed: c.status !== 'active',
        }))
      : weekDates(date).map((d) => ({
          key: d,
          label: dayLabel.format(new Date(`${d}T12:00:00-03:00`)),
          day: d,
          court: weekCourtId,
          closed: courts.find((c) => c.id === weekCourtId)?.status !== 'active',
        }));
  const visible = columns.flatMap((c) => bookingsOn(bookings, c.day, c.court));
  const empty = visible.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {empty && (
        <Card>
          <p role="status">
            {t(isToday && view === 'day' ? 'calendar.empty' : 'calendar.emptyOther')}
          </p>
        </Card>
      )}
      {view === 'day' && perScreen < courts.length && (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('calendar.courts.window')}
          <select
            className={inputClass}
            value={first}
            onChange={(e) => setFirstCourt(Number(e.target.value))}
          >
            {Array.from({ length: courts.length - perScreen + 1 }, (_unused, i) => (
              <option key={i} value={i}>
                {perScreen === 1
                  ? (courts[i]?.name ?? '')
                  : t('calendar.courts.window.option', {
                      from: courts[i]?.name ?? '',
                      to: courts[i + perScreen - 1]?.name ?? '',
                    })}
              </option>
            ))}
          </select>
        </label>
      )}
      <div
        role="grid"
        aria-label={t('calendar.grid')}
        className="grid overflow-x-auto rounded-xl border border-line bg-white"
        style={{ gridTemplateColumns: `4rem repeat(${columns.length}, minmax(8rem, 1fr))` }}
      >
        <div role="row" className="contents">
          <div className="border-b border-line" />
          {columns.map((c) => (
            <div
              key={c.key}
              role="columnheader"
              className="border-b border-l border-line p-2 text-center font-semibold"
            >
              {c.label}
            </div>
          ))}
        </div>
        <div role="row" className="contents">
          <div role="rowheader" className="relative" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((h, i) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-xs text-ink3"
                style={{ top: i * HOUR_PX, ...(i === 0 ? { transform: 'none' } : {}) }}
              >
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {columns.map((c) => (
            <div
              key={c.key}
              role="gridcell"
              className={`relative border-l border-line ${c.closed ? 'bg-line' : ''}`}
              style={{
                height: hours.length * HOUR_PX,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, #D5DAE3 ${HOUR_PX - 1}px, #D5DAE3 ${HOUR_PX}px)`,
              }}
            >
              {c.closed && (
                <span className="absolute inset-x-1 top-1 rounded bg-line px-1 text-xs font-semibold text-night">
                  {t('calendar.state.blocked')}
                </span>
              )}
              {bookingsOn(bookings, c.day, c.court).map((b) => (
                <BookingBlock
                  key={b.id}
                  booking={b}
                  day={c.day}
                  start={start}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BookingBlock({
  booking,
  day,
  start,
  onSelect,
}: {
  booking: Schema<'ClubBooking'>;
  day: string;
  start: number;
  onSelect: (booking: Schema<'ClubBooking'>) => void;
}) {
  const state = bookingState(booking) ?? 'deposit';
  const top = ((minutesIntoDay(booking.starts_at, day) - start * 60) / 60) * HOUR_PX;
  const height =
    ((minutesIntoDay(booking.ends_at, day) - minutesIntoDay(booking.starts_at, day)) / 60) *
    HOUR_PX;
  const name = booking.booker.name ?? booking.booker.phone ?? '';
  const stateText = t(`calendar.state.${state}` as MessageKey);
  return (
    <button
      type="button"
      onClick={() => onSelect(booking)}
      aria-label={t('calendar.booking.aria', {
        court: booking.court_name,
        from: formatTime(booking.starts_at),
        to: formatTime(booking.ends_at),
        name,
        state: stateText,
      })}
      className={`absolute inset-x-1 overflow-hidden rounded-lg p-1 text-left text-xs font-semibold focus:outline-2 focus:outline-night ${stateClass[state]}`}
      style={{ top: Math.max(0, top), height: Math.max(24, height - 2) }}
    >
      <span className="block truncate">{name}</span>
      <span className="block truncate font-normal">
        {formatTime(booking.starts_at)}–{formatTime(booking.ends_at)} · {stateText}
      </span>
    </button>
  );
}

function BookingDetail({
  booking,
  client,
  clubId,
  onClose,
}: {
  booking: Schema<'ClubBooking'>;
  client: ApiClient;
  clubId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<Schema<'BookingCancellation'> | null>(null);
  const state = bookingState(booking);
  const cancel = useMutation({
    mutationFn: async () => {
      const { data, error } = await client.POST('/bookings/{id}/cancel', {
        params: { path: { id: booking.id } },
        body: {},
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
    onSuccess: async (data) => {
      setResult(data);
      await queryClient.invalidateQueries({ queryKey: ['club-bookings', clubId] });
    },
  });
  const rows: [string, string][] = [
    [t('calendar.detail.court'), booking.court_name],
    [t('calendar.detail.time'), `${formatTime(booking.starts_at)}–${formatTime(booking.ends_at)}`],
    [t('calendar.detail.booker'), booking.booker.name ?? '—'],
    [t('calendar.detail.phone'), booking.booker.phone ?? '—'],
    [t('calendar.detail.price'), formatCents(booking.price_cents)],
    [t('calendar.detail.deposit'), formatCents(booking.deposit_paid_cents)],
    [
      t('calendar.detail.state'),
      state ? t(`calendar.state.${state}` as MessageKey) : booking.status,
    ],
  ];

  return (
    <Sheet open onClose={onClose} title={t('calendar.detail.title')}>
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-ink3">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        {booking.booker.account_pending && (
          <p className="text-sm text-ink2">{t('calendar.detail.pending')}</p>
        )}
        {result ? (
          <div role="status" className="flex flex-col gap-1">
            <p className="font-semibold">{t('calendar.cancel.done')}</p>
            {result.refund_cents > 0 && (
              <p>{t('calendar.cancel.refund', { amount: formatCents(result.refund_cents) })}</p>
            )}
          </div>
        ) : asking ? (
          <div className="flex flex-col gap-3">
            <p>{t('calendar.cancel.ask')}</p>
            {cancel.isError && (
              <p role="alert" className={errorClass}>
                {t('calendar.cancel.failed')}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                label={t('calendar.cancel.confirm')}
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              />
              <Button label={t('calendar.cancel.keep')} onClick={() => setAsking(false)} />
            </div>
          </div>
        ) : (
          state &&
          booking.status === 'confirmed' && (
            <Button label={t('calendar.cancel')} onClick={() => setAsking(true)} />
          )
        )}
        <Button label={t('calendar.detail.close')} onClick={onClose} />
      </div>
    </Sheet>
  );
}
