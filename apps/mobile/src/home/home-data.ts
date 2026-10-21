// Data for the home screen: the next booking and the last published match of the signed-in user.
// The last match comes from GET /me/matches. The contract has no "my bookings" endpoint yet, so
// the next booking comes from a dev-only mock and release builds show the empty state until the
// endpoint exists.
import { useQuery } from '@tanstack/react-query';

import type { Schema } from '@app/contracts';

import { useApi } from '../api/client';

export type NextBooking = Pick<
  Schema<'Booking'>,
  'id' | 'starts_at' | 'ends_at' | 'duration_minutes' | 'status'
> & { club: Schema<'EntityRef'>; court: Schema<'EntityRef'> };

export type NextBookingLoader = () => Promise<NextBooking | null>;

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function useLastMatch() {
  const api = useApi();
  return useQuery({
    queryKey: ['me', 'matches', 'last'],
    queryFn: async (): Promise<Schema<'MatchSummary'> | null> => {
      const { data, error } = await api.GET('/me/matches', {
        params: { query: { limit: 1, status: 'published' } },
      });
      if (error) throw new Error(error.code);
      return data.items[0] ?? null;
    },
  });
}

export function useNextBooking(load: NextBookingLoader) {
  return useQuery({ queryKey: ['me', 'bookings', 'next'], queryFn: load });
}

/** "sábado 24 de octubre · 19:00" in Buenos Aires time. */
export function formatSlot(iso: string, locale = 'es-AR'): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TIME_ZONE,
  }).format(date);
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(date);
  return `${day} · ${time}`;
}

/** Sets seen from the user's team first: "6-4 3-6 7-5". */
export function formatSets(sets: Schema<'SetScore'>[], team: 1 | 2 | null): string {
  return sets
    .map((s) => (team === 2 ? `${s.team_2}-${s.team_1}` : `${s.team_1}-${s.team_2}`))
    .join(' ');
}
