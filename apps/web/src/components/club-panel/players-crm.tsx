'use client';

import type { ApiClient } from '@app/contracts';
import { Button, Card, DataLabel } from '@app/ui/web';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { t } from '@/i18n';
import type { MessageKey } from '@/i18n';
import { apiClient } from '@/lib/api/client';
import {
  SEGMENTS,
  TEMPLATES,
  formatFrequency,
  parseTags,
  whatsappLink,
} from '@/lib/club-crm/model';
import type { ClubPlayer, ClubPlayerDetail, ClubPlayerSegment } from '@/lib/club-crm/model';
import type { WhatsappTemplate } from '@/lib/club-crm/model';
import { formatCents, formatDateTime } from '@/lib/player/format';

const inputClass =
  'min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-night focus:border-court focus:outline-2 focus:outline-court';
const errorClass = 'border-l-4 border-alert pl-2 text-sm font-semibold text-night';

interface Props {
  clubId: string;
  client?: ApiClient;
}

export function PlayersCrm({ clubId, client = apiClient }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<ClubPlayerSegment | null>(null);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-2">
        <DataLabel label={t('crm.title')} />
        <h1 className="font-display text-3xl font-bold">{t('crm.title')}</h1>
        <p className="text-ink2">{t('crm.lead')}</p>
      </header>
      {selected ? (
        <PlayerFile
          clubId={clubId}
          client={client}
          userId={selected}
          onBack={() => setSelected(null)}
        />
      ) : (
        <PlayerList
          clubId={clubId}
          client={client}
          search={search}
          segment={segment}
          onSearch={setSearch}
          onSegment={setSegment}
          onOpen={setSelected}
        />
      )}
    </main>
  );
}

function PlayerList({
  clubId,
  client,
  search,
  segment,
  onSearch,
  onSegment,
  onOpen,
}: {
  clubId: string;
  client: ApiClient;
  search: string;
  segment: ClubPlayerSegment | null;
  onSearch: (q: string) => void;
  onSegment: (s: ClubPlayerSegment | null) => void;
  onOpen: (userId: string) => void;
}) {
  const q = search.trim();
  const list = useInfiniteQuery({
    queryKey: ['club-crm', clubId, q, segment],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await client.GET('/club-admin/players', {
        params: {
          query: {
            club_id: clubId,
            ...(q ? { q } : {}),
            ...(segment ? { segment } : {}),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const players = list.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = q !== '' || segment !== null;

  return (
    <>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t('crm.search')}
        <input
          type="search"
          className={inputClass}
          value={search}
          maxLength={100}
          onChange={(e) => onSearch(e.target.value)}
        />
      </label>
      <div role="group" aria-label={t('crm.segments')} className="flex flex-wrap gap-2">
        {[null, ...SEGMENTS].map((s) => (
          <button
            key={s ?? 'all'}
            type="button"
            aria-pressed={segment === s}
            onClick={() => onSegment(s)}
            className={`min-h-11 rounded-xl border px-4 font-semibold ${
              segment === s ? 'border-court bg-court text-white' : 'border-line bg-white text-night'
            }`}
          >
            {t(s ? (`crm.segment.${s}` as MessageKey) : 'crm.segment.all')}
          </button>
        ))}
      </div>

      {list.isPending && <p role="status">{t('crm.loading')}</p>}
      {list.isError && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className={errorClass}>{t('crm.loadFailed')}</p>
          <Button label={t('crm.retry')} onClick={() => void list.refetch()} />
        </div>
      )}
      {list.data && players.length === 0 && (
        <Card>
          <p role="status">{t(filtered ? 'crm.emptyFiltered' : 'crm.empty')}</p>
        </Card>
      )}
      {players.length > 0 && <PlayerTable players={players} onOpen={onOpen} />}
      {list.hasNextPage && (
        <Button
          label={t('crm.more')}
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        />
      )}
    </>
  );
}

function PlayerTable({
  players,
  onOpen,
}: {
  players: ClubPlayer[];
  onOpen: (userId: string) => void;
}) {
  // The owner sees spend; for staff the API sends null and the column is left out.
  const showSpend = players.some((p) => p.total_spend_cents !== null);
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full text-left">
        <caption className="sr-only">{t('crm.title')}</caption>
        <thead>
          <tr className="border-b border-line text-sm text-ink3">
            <th scope="col" className="p-3">
              {t('crm.col.name')}
            </th>
            <th scope="col" className="p-3">
              {t('crm.col.frequency')}
            </th>
            <th scope="col" className="p-3">
              {t('crm.col.lastVisit')}
            </th>
            <th scope="col" className="p-3">
              {t('crm.col.noShows')}
            </th>
            {showSpend && (
              <th scope="col" className="p-3 text-right">
                {t('crm.col.spend')}
              </th>
            )}
            <th scope="col" className="p-3">
              {t('crm.col.tags')}
            </th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.user_id} className="border-b border-line last:border-0">
              <td className="p-3">
                <button
                  type="button"
                  aria-label={t('crm.open', { name: p.name })}
                  onClick={() => onOpen(p.user_id)}
                  className="min-h-11 text-left font-semibold text-court underline"
                >
                  {p.name}
                </button>
              </td>
              <td className="p-3">{formatFrequency(p.bookings_per_month)}</td>
              <td className="p-3">
                {p.last_visit_at ? formatDateTime(p.last_visit_at) : t('crm.never')}
              </td>
              <td className="p-3">{p.no_shows}</td>
              {showSpend && (
                <td className="p-3 text-right">
                  {p.total_spend_cents === null ? '' : formatCents(p.total_spend_cents)}
                </td>
              )}
              <td className="p-3 text-sm">{p.tags.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlayerFile({
  clubId,
  client,
  userId,
  onBack,
}: {
  clubId: string;
  client: ApiClient;
  userId: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const key = ['club-crm-player', clubId, userId];
  const player = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await client.GET('/club-admin/players/{user_id}', {
        params: { path: { user_id: userId }, query: { club_id: clubId } },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });
  const club = useQuery({
    queryKey: ['club', clubId],
    queryFn: async () => {
      const { data, error } = await client.GET('/clubs/{id}', { params: { path: { id: clubId } } });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });
  const save = useMutation({
    mutationFn: async (body: { tags: string[]; notes: string | null }) => {
      const { data, error } = await client.PUT('/club-admin/players/{user_id}/notes', {
        params: { path: { user_id: userId }, query: { club_id: clubId } },
        body,
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      void queryClient.invalidateQueries({ queryKey: ['club-crm', clubId] });
    },
  });

  return (
    <section className="flex flex-col gap-4">
      <Button label={t('crm.back')} onClick={onBack} />
      {player.isPending && <p role="status">{t('crm.loading')}</p>}
      {player.isError && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className={errorClass}>{t('crm.detail.loadFailed')}</p>
          <Button label={t('crm.retry')} onClick={() => void player.refetch()} />
        </div>
      )}
      {player.data && (
        <>
          <h2 className="font-display text-2xl font-bold">{player.data.name}</h2>
          <Metrics p={player.data} />
          <WhatsappBox p={player.data} clubName={club.data?.name ?? ''} />
          <NotesForm
            key={`${player.data.tags.join()}|${player.data.notes ?? ''}`}
            p={player.data}
            pending={save.isPending}
            failed={save.isError}
            saved={save.isSuccess}
            onSubmit={(body) => save.mutate(body)}
          />
          <Timeline p={player.data} />
        </>
      )}
    </section>
  );
}

function Metrics({ p }: { p: ClubPlayerDetail }) {
  const rows: [string, string][] = [
    [
      t('crm.metric.frequency'),
      t('crm.metric.frequencyValue', { value: formatFrequency(p.bookings_per_month) }),
    ],
    [
      t('crm.metric.recurrence'),
      t('crm.metric.recurrenceValue', { weeks: p.active_weeks, window: p.weeks_window }),
    ],
    [t('crm.metric.noShows'), String(p.no_shows)],
    [t('crm.metric.lastVisit'), p.last_visit_at ? formatDateTime(p.last_visit_at) : t('crm.never')],
    ...(p.total_spend_cents === null
      ? []
      : [[t('crm.metric.spend'), formatCents(p.total_spend_cents)] as [string, string]]),
  ];
  return (
    <section aria-label={t('crm.metrics')} className="flex flex-col gap-2">
      <h3 className="font-display text-xl font-bold">{t('crm.metrics')}</h3>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl border border-line bg-white p-4">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink3">{label}</dt>
            <dd className="text-right font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function WhatsappBox({ p, clubName }: { p: ClubPlayerDetail; clubName: string }) {
  const [template, setTemplate] = useState<WhatsappTemplate>('reminder');
  const text = t(`crm.wa.text.${template}` as MessageKey, {
    name: p.name.split(' ')[0] ?? p.name,
    club: clubName,
  });
  const link = whatsappLink(p.phone, text);
  return (
    <section aria-label={t('crm.wa.title')} className="flex flex-col gap-3">
      <h3 className="font-display text-xl font-bold">{t('crm.wa.title')}</h3>
      {link === null ? (
        <p role="status">{t('crm.wa.noPhone')}</p>
      ) : (
        <>
          <label className="flex w-fit flex-col gap-1 text-sm font-semibold">
            {t('crm.wa.template')}
            <select
              className={inputClass}
              value={template}
              onChange={(e) => setTemplate(e.target.value as WhatsappTemplate)}
            >
              {TEMPLATES.map((k) => (
                <option key={k} value={k}>
                  {t(`crm.wa.${k}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <p className="rounded-xl border border-line bg-white p-3">{text}</p>
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 w-fit items-center rounded-xl border border-court px-4 font-semibold text-court"
          >
            {t('crm.wa.send')}
          </a>
        </>
      )}
    </section>
  );
}

function NotesForm({
  p,
  pending,
  failed,
  saved,
  onSubmit,
}: {
  p: ClubPlayerDetail;
  pending: boolean;
  failed: boolean;
  saved: boolean;
  onSubmit: (body: { tags: string[]; notes: string | null }) => void;
}) {
  const [tags, setTags] = useState(p.tags.join(', '));
  const [notes, setNotes] = useState(p.notes ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ tags: parseTags(tags), notes: notes.trim() || null });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label={t('crm.notes.title')}>
      <h3 className="font-display text-xl font-bold">{t('crm.notes.title')}</h3>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t('crm.notes.tags')}
        <input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t('crm.notes.notes')}
        <textarea
          className={inputClass}
          rows={3}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <p className="text-sm text-ink3">{t('crm.notes.hint')}</p>
      <Button type="submit" label={t('crm.notes.save')} disabled={pending} />
      {saved && !failed && <p role="status">{t('crm.notes.saved')}</p>}
      {failed && (
        <p role="alert" className={errorClass}>
          {t('crm.notes.failed')}
        </p>
      )}
    </form>
  );
}

function Timeline({ p }: { p: ClubPlayerDetail }) {
  return (
    <section aria-label={t('crm.timeline')} className="flex flex-col gap-2">
      <h3 className="font-display text-xl font-bold">{t('crm.timeline')}</h3>
      {p.recent_bookings.length === 0 ? (
        <p>{t('crm.timeline.empty')}</p>
      ) : (
        <ol className="flex flex-col gap-1 rounded-xl border border-line bg-white p-4">
          {p.recent_bookings.map((b) => (
            <li key={b.booking_id} className="flex flex-wrap justify-between gap-2">
              <span>
                {formatDateTime(b.starts_at)} · {b.court_name}
              </span>
              <span className="font-semibold">{t(`crm.status.${b.status}` as MessageKey)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
