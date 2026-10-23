// Favorite clubs of the player (issue #326): the list, the home with the bookings under each
// favorite (GET /me/home), and the star/reorder/cancel mutations that keep both in sync.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Schema } from '@app/contracts';

import { useApi } from '../api/client';

export type FavoriteClub = Schema<'FavoriteClub'>;
export type HomeFavorite = Schema<'HomeFavorite'>;
export type HomeBooking = HomeFavorite['next_bookings'][number];

/** A booking made a moment ago, shown on the home at once even before it is a favorite. */
export interface JustBooked {
  booking_id: string;
  club: { id: string; name: string; address: string | null; logo_url: string | null };
  court_name: string;
  starts_at: string;
  ends_at: string;
  status: 'held' | 'confirmed';
}

export const favoritesKey = ['me', 'favorite-clubs'] as const;
export const homeKey = ['me', 'home'] as const;
export const justBookedKey = ['ui', 'just-booked'] as const;

export class FavoritesApiError extends Error {}

function fail(error: { code?: string } | undefined): never {
  throw new FavoritesApiError(error?.code ?? 'INTERNAL_ERROR');
}

export function useFavorites() {
  const api = useApi();
  return useQuery({
    queryKey: favoritesKey,
    queryFn: async () => {
      const { data, error } = await api.GET('/me/favorite-clubs');
      if (!data) fail(error);
      return data.items;
    },
  });
}

export function useHomeFavorites() {
  const api = useApi();
  return useQuery({
    queryKey: homeKey,
    queryFn: async () => {
      const { data, error } = await api.GET('/me/home');
      if (!data) fail(error);
      return data.favorites;
    },
  });
}

/** The booking the player just made, until they answer the "mark as favorite?" question. */
export function useJustBooked() {
  const client = useQueryClient();
  const query = useQuery<JustBooked | null>({
    queryKey: justBookedKey,
    queryFn: () => client.getQueryData<JustBooked | null>(justBookedKey) ?? null,
    staleTime: Infinity,
  });
  return {
    justBooked: query.data ?? null,
    dismiss: () => client.setQueryData<JustBooked | null>(justBookedKey, null),
  };
}

export function useFavoriteActions() {
  const api = useApi();
  const client = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: favoritesKey }),
      client.invalidateQueries({ queryKey: homeKey }),
    ]);
  };

  const add = useMutation({
    mutationFn: async (clubId: string) => {
      const { error } = await api.PUT('/me/favorite-clubs/{club_id}', {
        params: { path: { club_id: clubId } },
      });
      if (error) fail(error);
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (clubId: string) => {
      const { error } = await api.DELETE('/me/favorite-clubs/{club_id}', {
        params: { path: { club_id: clubId } },
      });
      if (error) fail(error);
    },
    onSuccess: refresh,
  });
  const reorder = useMutation({
    mutationFn: async (clubIds: string[]) => {
      const { error } = await api.PUT('/me/favorite-clubs', { body: { club_ids: clubIds } });
      if (error) fail(error);
    },
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await api.POST('/bookings/{id}/cancel', {
        params: { path: { id: bookingId } },
      });
      if (error) fail(error);
    },
    onSuccess: refresh,
  });
  return { add, remove, reorder, cancel };
}

/** "CP" for "Club Demo Palermo": the first letters of the first two words. */
export function clubInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

/** `ids` with the item at `index` moved one place (-1 up, +1 down); same list at the edges. */
export function moveItem<T>(ids: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  const item = ids[index];
  if (item === undefined || target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}
