// Data for the tournaments screens (JG-07): list, detail with fixture and standings, and the
// registration with a partner. Everything except the partner lookup comes from the generated
// client (tournaments API, #321). The contract has no user search yet, so inviting a partner goes
// through a PartnerFinder whose dev/test implementation lives in mock-tournaments.ts; release
// builds without a finder show the "not available" state instead of a mock.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Schema } from '@app/contracts';

import { useApi } from '../api/client';

export type Tournament = Schema<'Tournament'>;
export type TournamentDetail = Schema<'TournamentDetail'>;
export type TournamentPair = Schema<'TournamentPair'>;
export type TournamentMatch = Schema<'TournamentMatch'>;

export interface Partner {
  user_id: string;
  name: string;
}

export interface PartnerFinder {
  search(query: string): Promise<Partner[]>;
}

/** Thrown with the stable API error code (`CLUB_FEATURE_DISABLED`, `TOURNAMENT_PLAYER_TAKEN`...). */
export class ApiCodeError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const FEATURE_DISABLED = 'CLUB_FEATURE_DISABLED';

export function useTournaments(clubId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['clubs', clubId, 'tournaments'],
    queryFn: async () => {
      const { data, error } = await api.GET('/clubs/{id}/tournaments', {
        params: { path: { id: clubId } },
      });
      if (error) throw new ApiCodeError(error.code);
      return data.items;
    },
    retry: false,
  });
}

export function useTournament(clubId: string, tournamentId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['clubs', clubId, 'tournaments', tournamentId],
    queryFn: async () => {
      const { data, error } = await api.GET('/clubs/{id}/tournaments/{tournament_id}', {
        params: { path: { id: clubId, tournament_id: tournamentId } },
      });
      if (error) throw new ApiCodeError(error.code);
      return data;
    },
    retry: false,
  });
}

export function useRegister(clubId: string, tournamentId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (partnerUserId: string) => {
      const { data, error } = await api.POST(
        '/clubs/{id}/tournaments/{tournament_id}/registrations',
        {
          params: { path: { id: clubId, tournament_id: tournamentId } },
          body: { partner_user_id: partnerUserId },
        },
      );
      if (error) throw new ApiCodeError(error.code);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'tournaments'] }),
  });
}

export function usePartnerSearch(finder: PartnerFinder | undefined, query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['partner-search', trimmed],
    queryFn: () => (finder ? finder.search(trimmed) : Promise.resolve([])),
    enabled: !!finder && trimmed.length >= 2,
  });
}

export function myPair(detail: TournamentDetail, userId: string): TournamentPair | undefined {
  return detail.pairs.find((p) => p.players.some((pl) => pl.user_id === userId));
}

export function pairName(detail: TournamentDetail, pairId: string | null): string | null {
  const pair = detail.pairs.find((p) => p.id === pairId);
  return pair ? pair.players.map((pl) => pl.name).join(' / ') : null;
}

/** "Grupo A" for the 0-based group position. */
export function groupLetter(position: number): string {
  return String.fromCharCode(65 + position);
}

/** The first not yet confirmed match of the pair, by start time. */
export function nextMatch(detail: TournamentDetail, pairId: string): TournamentMatch | undefined {
  return detail.matches
    .filter((m) => m.status !== 'confirmed' && (m.pair_a_id === pairId || m.pair_b_id === pairId))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
}

export function canRegister(t: Tournament, alreadyIn: boolean): boolean {
  return t.status === 'registration' && !alreadyIn;
}
