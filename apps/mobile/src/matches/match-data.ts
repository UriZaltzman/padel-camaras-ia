// Data for the match screen: the match (GET /matches/{id}), its clips and the signed links of its
// media (GET /media/{id}/url). Signed links live only in the query cache, are refetched before
// they expire and are never persisted (spec §12: links of 1 hour, no permanent URLs).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Schema } from '@app/contracts';

import { useApi } from '../api/client';

export type MatchDetail = Schema<'MatchDetail'>;
export type PointToReview = Schema<'PointToReview'>;
export type PointFilter = 'all' | 'won' | 'lost';

/** Refetch a signed link this long before it expires. */
const URL_MARGIN_MS = 60_000;

export function useMatch(matchId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['matches', matchId],
    queryFn: async (): Promise<MatchDetail> => {
      const { data, error } = await api.GET('/matches/{id}', { params: { path: { id: matchId } } });
      if (error) throw new Error(error.code);
      return data;
    },
  });
}

export function useMatchClips(matchId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['matches', matchId, 'clips'],
    queryFn: async (): Promise<Schema<'Clip'>[]> => {
      const { data, error } = await api.GET('/matches/{id}/clips', {
        params: { path: { id: matchId }, query: { limit: 100 } },
      });
      if (error) throw new Error(error.code);
      return data.items;
    },
  });
}

/** Signed link of a media asset. Refreshes itself shortly before `expires_at`. */
export function useSignedUrl(mediaId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['media', mediaId, 'url'],
    enabled: mediaId !== null,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const exp = query.state.data?.expires_at;
      if (!exp) return false;
      return Math.max(Date.parse(exp) - Date.now() - URL_MARGIN_MS, 5_000);
    },
    queryFn: async (): Promise<Schema<'SignedMediaUrl'>> => {
      const { data, error } = await api.GET('/media/{id}/url', {
        params: { path: { id: mediaId ?? '' } },
      });
      if (error) throw new Error(error.code);
      return data;
    },
  });
}

/** Team of the signed-in user in this match; team 1 when they are not one of the players. */
export function teamOf(match: MatchDetail, userId: string | null): 1 | 2 {
  return match.players.find((p) => p.user?.id === userId)?.team ?? 1;
}

/** Points to review that the user's team won or lost, in play order. */
export function filterPoints(
  points: PointToReview[],
  team: 1 | 2,
  filter: PointFilter,
): PointToReview[] {
  const sorted = [...points].sort((a, b) => a.number - b.number);
  if (filter === 'all') return sorted;
  return sorted.filter((p) => (p.winner_team === team) === (filter === 'won'));
}

/**
 * Stats are approximate while some points are under 0.7 confidence (spec §6, layer 2): the
 * players have not confirmed them yet.
 */
export function statsAreApproximate(match: MatchDetail): boolean {
  return match.points_to_review.length > 0;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** Positions nobody has claimed yet; the options left for the players still to choose. */
export function unclaimedPlayers(match: MatchDetail): MatchDetail['players'] {
  return match.players.filter((p) => p.user === null);
}

/** The claim step shows while the match is published, the user holds no place and one is free. */
export function canClaim(match: MatchDetail, userId: string | null): boolean {
  return (
    match.status === 'published' &&
    !match.players.some((p) => p.user?.id === userId) &&
    unclaimedPlayers(match).length > 0
  );
}

export function useClaimPlayer(matchId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (position: MatchDetail['players'][number]['position']) => {
      const { data, error } = await api.POST('/matches/{id}/claim-player', {
        params: { path: { id: matchId } },
        body: { position },
      });
      if (error) throw new Error(error.code);
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(['matches', matchId], data),
    // A taken slot means our view is stale: reload so the options narrow.
    onError: () => void queryClient.invalidateQueries({ queryKey: ['matches', matchId] }),
  });
}
