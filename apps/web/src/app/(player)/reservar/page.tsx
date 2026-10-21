import type { Schema } from '@app/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';

import { SlotList } from '@/components/player/slot-list';
import { inputClass, labelClass } from '@/components/player/styles';
import { t } from '@/i18n';
import { apiClient } from '@/lib/api/client';
import { todayLocal } from '@/lib/player/format';

export const metadata: Metadata = { title: t('player.book.title') };

const DURATIONS = [60, 90, 120] as const;

const querySchema = z.object({
  club: z.uuid().optional().catch(undefined),
  court: z.uuid().optional().catch(undefined),
  date: z.iso.date().optional().catch(undefined),
  duration: z.coerce
    .number()
    .pipe(z.union([z.literal(60), z.literal(90), z.literal(120)]))
    .catch(90),
});

type Query = Record<string, string | undefined>;

export default async function BookPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = querySchema.parse(await searchParams);
  const date = query.date ?? todayLocal();
  const duration: Schema<'BookingDuration'> = query.duration;

  const clubs = (await apiClient.GET('/clubs', { params: { query: {} } })).data?.items ?? [];
  const clubId = query.club ?? clubs[0]?.id;
  const club = clubId
    ? (await apiClient.GET('/clubs/{id}', { params: { path: { id: clubId } } })).data
    : undefined;
  const courts = club?.courts.filter((c) => c.status === 'active') ?? [];
  const court = courts.find((c) => c.id === query.court) ?? courts[0];
  const availability = court
    ? await apiClient.GET('/courts/{id}/availability', {
        params: { path: { id: court.id }, query: { date, duration_minutes: duration } },
      })
    : undefined;

  const href = (over: Query) => {
    const params = new URLSearchParams({
      ...(clubId ? { club: clubId } : {}),
      ...(court ? { court: court.id } : {}),
      date,
      duration: String(duration),
      ...over,
    });
    return `/reservar?${params}`;
  };

  return (
    <>
      <h1 className="font-display text-3xl font-bold">{t('player.book.title')}</h1>
      {clubs.length === 0 || !club ? (
        <p role="alert">{t('player.book.noClubs')}</p>
      ) : (
        <>
          <form method="get" className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              {t('player.book.club')}
              <select name="club" defaultValue={club.id} className={inputClass}>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {t('player.book.clubOption', { name: c.name, city: c.city })}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              {t('player.book.court')}
              <select name="court" defaultValue={court?.id} className={inputClass}>
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              {t('player.book.date')}
              <input
                name="date"
                type="date"
                defaultValue={date}
                min={todayLocal()}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              {t('player.book.duration')}
              <select name="duration" defaultValue={duration} className={inputClass}>
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {t('player.book.minutes', { n: d })}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-night px-4 font-semibold text-white sm:col-span-2"
            >
              {t('player.book.search')}
            </button>
          </form>
          <section aria-labelledby="slots-title" className="flex flex-col gap-3">
            <h2 id="slots-title" className="font-display text-xl font-bold">
              {t('player.book.slotsTitle', { court: court?.name ?? '' })}
            </h2>
            {availability?.data ? (
              <SlotList
                courtId={availability.data.court_id}
                durationMinutes={duration}
                slots={availability.data.slots}
                back={href({})}
              />
            ) : (
              <p role="alert">
                {t('player.error.generic')} <Link href={href({})}>{t('player.book.retry')}</Link>
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
