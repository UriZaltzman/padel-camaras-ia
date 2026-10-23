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
import { SEGMENTS, whatsappLink } from '@/lib/club-crm/model';
import type { ClubPlayerSegment } from '@/lib/club-crm/model';
import {
  groupLetter,
  inviteLink,
  knockoutStages,
  localToIso,
  pairName,
  stageMatches,
  validSets,
} from '@/lib/club-tournaments/model';
import type {
  SetScore,
  TournamentDetail as Detail,
  TournamentMatch,
} from '@/lib/club-tournaments/model';
import { formatCents, formatDateTime, todayLocal } from '@/lib/player/format';

import { errorClass, inputClass, useTournamentsEnabled } from './tournaments-home';

interface Props {
  clubId: string;
  tournamentId: string;
  client?: ApiClient;
  /** Today's date `YYYY-MM-DD`; tests pin it. */
  today?: string;
  /** Origin used for the public link; defaults to the current page's. */
  origin?: string;
}

export function TournamentDetail({
  clubId,
  tournamentId,
  client = apiClient,
  today = todayLocal(),
  origin,
}: Props) {
  const queryClient = useQueryClient();
  const key = ['club-tournament', clubId, tournamentId];
  const club = useTournamentsEnabled(clubId, client);
  const enabled = club.data?.modules.tournaments;
  const tournament = useQuery({
    queryKey: key,
    enabled: enabled === true,
    queryFn: async () => {
      const { data, error } = await client.GET('/clubs/{id}/tournaments/{tournament_id}', {
        params: { path: { id: clubId, tournament_id: tournamentId } },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });
  const apply = (data: Detail) => {
    queryClient.setQueryData(key, data);
    void queryClient.invalidateQueries({ queryKey: ['club-tournaments', clubId] });
    void queryClient.invalidateQueries({ queryKey: ['club-tournament-ranking', clubId] });
  };
  const d = tournament.data;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6">
      <Link
        href={`/panel/clubes/${clubId}/torneos`}
        className="inline-flex min-h-11 w-fit items-center font-semibold text-court underline"
      >
        {t('tournaments.back')}
      </Link>
      {club.isPending && <p role="status">{t('tournaments.loading')}</p>}
      {enabled === false && (
        <Card>
          <p role="status">{t('tournaments.disabled')}</p>
        </Card>
      )}
      {tournament.isError && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className={errorClass}>{t('tournaments.detail.loadFailed')}</p>
          <Button label={t('tournaments.retry')} onClick={() => void tournament.refetch()} />
        </div>
      )}
      {d && (
        <>
          <header className="flex flex-col gap-2">
            <DataLabel label={t(`tournaments.status.${d.status}` as MessageKey)} />
            <h1 className="font-display text-3xl font-bold">{d.name}</h1>
            <p className="text-ink2">
              {t('tournaments.category', { n: d.category })} ·{' '}
              {d.entry_fee_cents === 0
                ? t('tournaments.free')
                : t('tournaments.fee', { amount: formatCents(d.entry_fee_cents) })}
            </p>
          </header>
          {d.status === 'registration' && (
            <>
              <Invitations
                clubId={clubId}
                client={client}
                tournament={d}
                clubName={club.data?.name ?? ''}
                origin={origin ?? (typeof window === 'undefined' ? '' : window.location.origin)}
              />
              <Registrations clubId={clubId} client={client} tournament={d} onChange={apply} />
              <DrawForm
                clubId={clubId}
                client={client}
                tournament={d}
                courts={(club.data?.courts ?? []).filter((c) => c.status === 'active')}
                today={today}
                onDone={apply}
              />
            </>
          )}
          {d.groups.length > 0 && <Groups d={d} />}
          {d.matches.length > 0 && (
            <Fixture
              clubId={clubId}
              client={client}
              d={d}
              courtNames={courtNames(club.data)}
              onChange={apply}
            />
          )}
          {d.status === 'finished' && <Ranking clubId={clubId} client={client} d={d} />}
        </>
      )}
    </main>
  );
}

function courtNames(club: { courts: { id: string; name: string }[] } | undefined) {
  return new Map((club?.courts ?? []).map((c) => [c.id, c.name]));
}

function Invitations({
  clubId,
  client,
  tournament,
  clubName,
  origin,
}: {
  clubId: string;
  client: ApiClient;
  tournament: Detail;
  clubName: string;
  origin: string;
}) {
  const [segment, setSegment] = useState<ClubPlayerSegment | null>(null);
  const [tag, setTag] = useState('');
  const [copied, setCopied] = useState(false);
  const link = inviteLink(clubId, tournament.id, origin);
  const wanted = tag.trim();
  const players = useQuery({
    queryKey: ['club-crm', clubId, 'invite', segment, wanted],
    queryFn: async () => {
      const { data, error } = await client.GET('/club-admin/players', {
        params: {
          query: {
            club_id: clubId,
            ...(segment ? { segment } : {}),
            ...(wanted ? { tag: wanted } : {}),
          },
        },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data.items;
    },
  });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section aria-label={t('tournaments.invite.title')} className="flex flex-col gap-3">
      <h2 className="font-display text-2xl font-bold">{t('tournaments.invite.title')}</h2>
      <p className="text-ink2">{t('tournaments.invite.lead')}</p>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('tournaments.invite.link')}
          <input readOnly className={inputClass} value={link} onFocus={(e) => e.target.select()} />
        </label>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            label={t('tournaments.invite.copy')}
            onClick={() => void copy()}
          />
          {copied && <span role="status">{t('tournaments.invite.copied')}</span>}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t('tournaments.invite.tag')}
        <input
          className={inputClass}
          value={tag}
          maxLength={30}
          onChange={(e) => setTag(e.target.value)}
        />
      </label>
      <div
        role="group"
        aria-label={t('tournaments.invite.segments')}
        className="flex flex-wrap gap-2"
      >
        {[null, ...SEGMENTS].map((s) => (
          <button
            key={s ?? 'all'}
            type="button"
            aria-pressed={segment === s}
            onClick={() => setSegment(s)}
            className={`min-h-11 rounded-xl border px-4 font-semibold ${
              segment === s ? 'border-court bg-court text-white' : 'border-line bg-white text-night'
            }`}
          >
            {t(s ? (`crm.segment.${s}` as MessageKey) : 'crm.segment.all')}
          </button>
        ))}
      </div>
      {players.isError && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className={errorClass}>{t('tournaments.invite.loadFailed')}</p>
          <Button label={t('tournaments.retry')} onClick={() => void players.refetch()} />
        </div>
      )}
      {players.data?.length === 0 && <p role="status">{t('tournaments.invite.empty')}</p>}
      <ul className="flex flex-col gap-2">
        {players.data?.map((p) => {
          const text = t('tournaments.invite.text', {
            name: p.name.split(' ')[0] ?? p.name,
            tournament: tournament.name,
            club: clubName,
            category: t('tournaments.category', { n: tournament.category }),
          });
          const wa = whatsappLink(p.phone, `${text} ${link}`);
          return (
            <li
              key={p.user_id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-3"
            >
              <span className="font-semibold">{p.name}</span>
              {wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('tournaments.invite.send', { name: p.name })}
                  className="inline-flex min-h-11 items-center rounded-xl border border-court px-4 font-semibold text-court"
                >
                  {t('crm.wa.send')}
                </a>
              ) : (
                <span className="text-sm text-ink3">{t('tournaments.invite.noPhone')}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Registrations({
  clubId,
  client,
  tournament,
  onChange,
}: {
  clubId: string;
  client: ApiClient;
  tournament: Detail;
  onChange: (d: Detail) => void;
}) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['club-tournament', clubId, tournament.id] });
  const path = { id: clubId, tournament_id: tournament.id };
  const pay = useMutation({
    mutationFn: async (registration_id: string) => {
      const { data, error } = await client.PUT(
        '/clubs/{id}/tournaments/{tournament_id}/registrations/{registration_id}/payment',
        { params: { path: { ...path, registration_id } } },
      );
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
    onSuccess: () => void refresh(),
  });
  const withdraw = useMutation({
    mutationFn: async (registration_id: string) => {
      const { error } = await client.DELETE(
        '/clubs/{id}/tournaments/{tournament_id}/registrations/{registration_id}',
        { params: { path: { ...path, registration_id } } },
      );
      if (error) throw new Error(error.code ?? 'UNKNOWN');
    },
    onSuccess: () => void refresh(),
  });
  void onChange;
  return (
    <section aria-label={t('tournaments.registrations.title')} className="flex flex-col gap-3">
      <h2 className="font-display text-2xl font-bold">
        {t('tournaments.registrations.title')} ({tournament.pairs.length})
      </h2>
      {tournament.pairs.length === 0 && <p role="status">{t('tournaments.registrations.empty')}</p>}
      <ul className="flex flex-col gap-2">
        {tournament.pairs.map((p) => {
          const name = p.players.map((x) => x.name).join(' / ');
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-3"
            >
              <span className="font-semibold">{name}</span>
              <span className="flex flex-wrap items-center gap-2">
                {tournament.entry_fee_cents > 0 &&
                  (p.paid ? (
                    <span className="text-sm font-semibold">
                      {t('tournaments.registrations.paid')}
                    </span>
                  ) : (
                    <Button
                      variant="secondary"
                      label={t('tournaments.registrations.markPaid', { name })}
                      onClick={() => pay.mutate(p.id)}
                    />
                  ))}
                <Button
                  variant="secondary"
                  label={t('tournaments.registrations.withdraw', { name })}
                  onClick={() => withdraw.mutate(p.id)}
                />
              </span>
            </li>
          );
        })}
      </ul>
      {(pay.isError || withdraw.isError) && (
        <p role="alert" className={errorClass}>
          {t('tournaments.registrations.failed')}
        </p>
      )}
    </section>
  );
}

function DrawForm({
  clubId,
  client,
  tournament,
  courts,
  today,
  onDone,
}: {
  clubId: string;
  client: ApiClient;
  tournament: Detail;
  courts: { id: string; name: string }[];
  today: string;
  onDone: (d: Detail) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('21:00');
  const [problem, setProblem] = useState<string | null>(null);
  const draw = useMutation({
    mutationFn: async () => {
      const { data, error } = await client.POST('/clubs/{id}/tournaments/{tournament_id}/draw', {
        params: { path: { id: clubId, tournament_id: tournament.id } },
        body: {
          court_ids: picked,
          window_starts_at: localToIso(date, from),
          window_ends_at: localToIso(date, to),
        },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
    onSuccess: (data) => {
      setProblem(null);
      onDone(data);
    },
    onError: (e: Error) => {
      const key = `tournaments.draw.error.${e.message}`;
      setProblem(
        key === 'tournaments.draw.error.TOURNAMENT_PAIR_COUNT_INVALID' ||
          key === 'tournaments.draw.error.TOURNAMENT_NOT_ENOUGH_SLOTS'
          ? t(key)
          : t('tournaments.draw.error.other'),
      );
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (picked.length === 0) {
      setProblem(t('tournaments.draw.noCourts'));
      return;
    }
    draw.mutate();
  };
  return (
    <form
      onSubmit={submit}
      aria-label={t('tournaments.draw.title')}
      className="flex flex-col gap-3"
    >
      <h2 className="font-display text-2xl font-bold">{t('tournaments.draw.title')}</h2>
      <p className="text-ink2">{t('tournaments.draw.lead')}</p>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-1 text-sm font-semibold">{t('tournaments.draw.courts')}</legend>
        {courts.map((c) => (
          <label key={c.id} className="flex min-h-11 items-center gap-2 font-semibold">
            <input
              type="checkbox"
              checked={picked.includes(c.id)}
              onChange={(e) =>
                setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))
              }
            />
            {c.name}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('tournaments.draw.date')}
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('tournaments.draw.from')}
          <input
            type="time"
            className={inputClass}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('tournaments.draw.to')}
          <input
            type="time"
            className={inputClass}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {problem && (
        <p role="alert" className={errorClass}>
          {problem}
        </p>
      )}
      <Button type="submit" label={t('tournaments.draw.submit')} disabled={draw.isPending} />
    </form>
  );
}

function Groups({ d }: { d: Detail }) {
  return (
    <section aria-label={t('tournaments.groups.title')} className="flex flex-col gap-3">
      <h2 className="font-display text-2xl font-bold">{t('tournaments.groups.title')}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {d.groups.map((g) => (
          <div key={g.id} className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full text-left">
              <caption className="p-3 font-display text-lg font-bold">
                {t('tournaments.groups.group', { letter: groupLetter(g.position) })}
              </caption>
              <thead>
                <tr className="border-b border-line text-sm text-ink3">
                  <th scope="col" className="p-2">
                    {t('tournaments.groups.col.pair')}
                  </th>
                  <th scope="col" className="p-2">
                    {t('tournaments.groups.col.played')}
                  </th>
                  <th scope="col" className="p-2">
                    {t('tournaments.groups.col.wins')}
                  </th>
                  <th scope="col" className="p-2">
                    {t('tournaments.groups.col.sets')}
                  </th>
                  <th scope="col" className="p-2">
                    {t('tournaments.groups.col.games')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {g.standings.map((s) => (
                  <tr key={s.pair_id} className="border-b border-line last:border-0">
                    <td className="p-2 font-semibold">{pairName(d.pairs, s.pair_id)}</td>
                    <td className="p-2">{s.played}</td>
                    <td className="p-2">{s.wins}</td>
                    <td className="p-2">
                      {s.sets_for}-{s.sets_against}
                    </td>
                    <td className="p-2">
                      {s.games_for}-{s.games_against}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}

function Fixture({
  clubId,
  client,
  d,
  courtNames: courts,
  onChange,
}: {
  clubId: string;
  client: ApiClient;
  d: Detail;
  courtNames: Map<string, string>;
  onChange: (d: Detail) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const confirm = useMutation({
    mutationFn: async (match_id: string) => {
      const { data, error } = await client.PUT(
        '/clubs/{id}/tournaments/{tournament_id}/matches/{match_id}/result/confirmation',
        { params: { path: { id: clubId, tournament_id: d.id, match_id } } },
      );
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
    onSuccess: onChange,
  });
  const groupMatches = d.matches.filter((m) => m.stage === 'group');
  const row = (m: TournamentMatch) => (
    <MatchRow
      key={m.id}
      m={m}
      d={d}
      court={courts.get(m.court_id) ?? ''}
      editing={editing === m.id}
      clubId={clubId}
      client={client}
      onEdit={() => setEditing(m.id)}
      onClose={() => setEditing(null)}
      onConfirm={() => confirm.mutate(m.id)}
      onChange={(data) => {
        setEditing(null);
        onChange(data);
      }}
    />
  );
  return (
    <>
      {groupMatches.length > 0 && (
        <section aria-label={t('tournaments.fixture.title')} className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold">{t('tournaments.fixture.title')}</h2>
          <h3 className="font-display text-lg font-bold">{t('tournaments.stage.group')}</h3>
          <ul className="flex flex-col gap-2">{groupMatches.map(row)}</ul>
        </section>
      )}
      <section aria-label={t('tournaments.bracket.title')} className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold">{t('tournaments.bracket.title')}</h2>
        <div className="grid gap-4 md:grid-flow-col md:auto-cols-fr">
          {knockoutStages(d.matches).map((stage) => (
            <div key={stage} className="flex flex-col gap-2">
              <h3 className="font-display text-lg font-bold">
                {t(`tournaments.stage.${stage}` as MessageKey)}
              </h3>
              <ul className="flex flex-col gap-2">{stageMatches(d.matches, stage).map(row)}</ul>
            </div>
          ))}
        </div>
      </section>
      {confirm.isError && (
        <p role="alert" className={errorClass}>
          {t('tournaments.result.failed')}
        </p>
      )}
    </>
  );
}

function MatchRow({
  m,
  d,
  court,
  editing,
  clubId,
  client,
  onEdit,
  onClose,
  onConfirm,
  onChange,
}: {
  m: TournamentMatch;
  d: Detail;
  court: string;
  editing: boolean;
  clubId: string;
  client: ApiClient;
  onEdit: () => void;
  onClose: () => void;
  onConfirm: () => void;
  onChange: (d: Detail) => void;
}) {
  const a = pairName(d.pairs, m.pair_a_id) ?? t('tournaments.match.tbd');
  const b = pairName(d.pairs, m.pair_b_id) ?? t('tournaments.match.tbd');
  const known = m.pair_a_id !== null && m.pair_b_id !== null;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3">
      <p className="font-semibold">
        <span className={m.winner_pair_id && m.winner_pair_id === m.pair_a_id ? 'underline' : ''}>
          {a}
        </span>
        {' · '}
        <span className={m.winner_pair_id && m.winner_pair_id === m.pair_b_id ? 'underline' : ''}>
          {b}
        </span>
      </p>
      <p className="text-sm text-ink2">
        {t('tournaments.match.court', { court, when: formatDateTime(m.starts_at) })} ·{' '}
        {t(`tournaments.match.status.${m.status}` as MessageKey)}
        {m.sets && ` · ${m.sets.map((s) => `${s.team_1}-${s.team_2}`).join(' ')}`}
      </p>
      {known && m.status !== 'confirmed' && !editing && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            label={t('tournaments.match.enter', { a, b })}
            onClick={onEdit}
          />
          {m.status === 'awaiting_confirmation' && (
            <Button label={t('tournaments.match.confirm', { a, b })} onClick={onConfirm} />
          )}
        </div>
      )}
      {editing && (
        <ResultForm
          m={m}
          d={d}
          a={a}
          b={b}
          clubId={clubId}
          client={client}
          onClose={onClose}
          onChange={onChange}
        />
      )}
    </li>
  );
}

function ResultForm({
  m,
  d,
  a,
  b,
  clubId,
  client,
  onClose,
  onChange,
}: {
  m: TournamentMatch;
  d: Detail;
  a: string;
  b: string;
  clubId: string;
  client: ApiClient;
  onClose: () => void;
  onChange: (d: Detail) => void;
}) {
  const [sets, setSets] = useState<{ one: string; two: string }[]>([
    { one: '', two: '' },
    { one: '', two: '' },
  ]);
  const [invalid, setInvalid] = useState(false);
  const save = useMutation({
    mutationFn: async (body: SetScore[]) => {
      const { data, error } = await client.PUT(
        '/clubs/{id}/tournaments/{tournament_id}/matches/{match_id}/result',
        {
          params: { path: { id: clubId, tournament_id: d.id, match_id: m.id } },
          body: { sets: body },
        },
      );
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
    onSuccess: onChange,
  });
  const parsed = sets.map((s) => ({ team_1: Number(s.one), team_2: Number(s.two) }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const ok =
      sets.every((s) => /^[0-7]$/.test(s.one) && /^[0-7]$/.test(s.two)) && validSets(parsed);
    setInvalid(!ok);
    if (ok) save.mutate(parsed);
  };
  const set = (n: number, side: 'one' | 'two', value: string) =>
    setSets(sets.map((s, i) => (i === n ? { ...s, [side]: value } : s)));
  return (
    <form
      onSubmit={submit}
      aria-label={t('tournaments.result.title', { a, b })}
      className="flex flex-col gap-3"
    >
      {sets.map((s, n) => (
        <fieldset key={n} className="flex flex-wrap items-end gap-3">
          <legend className="text-sm font-semibold">
            {t('tournaments.result.set', { n: n + 1 })}
          </legend>
          <label className="flex flex-col gap-1 text-sm">
            <span className="sr-only">
              {t('tournaments.result.team1', { name: a })} ({n + 1})
            </span>
            <input
              aria-label={`${t('tournaments.result.set', { n: n + 1 })}: ${t('tournaments.result.team1', { name: a })}`}
              className={`${inputClass} w-20`}
              inputMode="numeric"
              maxLength={1}
              value={s.one}
              onChange={(e) => set(n, 'one', e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <input
              aria-label={`${t('tournaments.result.set', { n: n + 1 })}: ${t('tournaments.result.team2', { name: b })}`}
              className={`${inputClass} w-20`}
              inputMode="numeric"
              maxLength={1}
              value={s.two}
              onChange={(e) => set(n, 'two', e.target.value)}
            />
          </label>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        {sets.length < 3 ? (
          <Button
            variant="secondary"
            label={t('tournaments.result.addSet')}
            onClick={() => setSets([...sets, { one: '', two: '' }])}
          />
        ) : (
          <Button
            variant="secondary"
            label={t('tournaments.result.removeSet')}
            onClick={() => setSets(sets.slice(0, 2))}
          />
        )}
      </div>
      {invalid && (
        <p role="alert" className={errorClass}>
          {t('tournaments.result.invalid')}
        </p>
      )}
      {save.isError && (
        <p role="alert" className={errorClass}>
          {t('tournaments.result.failed')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" label={t('tournaments.result.save')} disabled={save.isPending} />
        <Button variant="secondary" label={t('tournaments.result.cancel')} onClick={onClose} />
      </div>
    </form>
  );
}

function Ranking({ clubId, client, d }: { clubId: string; client: ApiClient; d: Detail }) {
  const ranking = useQuery({
    queryKey: ['club-tournament-ranking', clubId, d.category, d.status],
    queryFn: async () => {
      const { data, error } = await client.GET('/clubs/{id}/tournament-ranking', {
        params: { path: { id: clubId }, query: { category: d.category } },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });
  const category = t('tournaments.category', { n: d.category });
  return (
    <section
      aria-label={t('tournaments.ranking.title', { category })}
      className="flex flex-col gap-3"
    >
      <h2 className="font-display text-2xl font-bold">
        {t('tournaments.ranking.title', { category })}
      </h2>
      <p className="text-ink2">{t('tournaments.ranking.lead')}</p>
      {ranking.data?.entries.length === 0 && <p role="status">{t('tournaments.ranking.empty')}</p>}
      <ol className="flex flex-col gap-2">
        {ranking.data?.entries.map((e) => (
          <li
            key={e.user_id}
            className="flex justify-between rounded-xl border border-line bg-white p-3"
          >
            <span className="font-semibold">
              {e.position}. {e.name}
            </span>
            <span>{t('tournaments.ranking.points', { n: e.points })}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
