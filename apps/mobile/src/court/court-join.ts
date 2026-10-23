// On-court QR (/q/{court_id}, spec 4.3, screen JG-08a): find the active booking of the court,
// offer to join its match and pick a side and drive/revés. The contract has no endpoint for the
// court lookup or the join yet (issue for the architect), so the app talks to a CourtJoinService
// whose shapes are validated here. Dev/test serve it from mock-court.ts; release builds without
// a service show the "not available" state instead of a mock.
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import type { Schema } from '@app/contracts';

export const courtSessionSchema = z.object({
  court: z.object({ id: z.string(), name: z.string() }),
  club: z.object({ id: z.string(), name: z.string() }),
  /** Active booking of the court right now; null when nobody has the court. */
  booking: z
    .object({
      id: z.string(),
      match_id: z.string(),
      starts_at: z.string(),
      ends_at: z.string(),
      /** Positions (1-4) already held by someone. */
      taken_positions: z.array(z.number().int().min(1).max(4)),
    })
    .nullable(),
  /** Who pays for recording and analysis; comes from the club modules (#303). */
  ai_video: z.enum(['off', 'club_pays', 'player_pays']),
  /** Club allows a free session when nobody booked. */
  free_session_allowed: z.boolean(),
  /** Per-match extra in ARS cents, when ai_video is player_pays. */
  extra_amount_cents: z.number().int().nullable(),
  /** The caller already has Pro or already paid this match. */
  player_has_access: z.boolean(),
});
export type CourtSession = z.infer<typeof courtSessionSchema>;

export type Side = 'drive' | 'reves';
export type Team = 1 | 2;
export interface Spot {
  team: Team;
  side: Side;
}

export interface CourtJoinService {
  resolve(courtId: string): Promise<CourtSession>;
  join(courtId: string, position: number): Promise<{ match_id: string }>;
}

/** Position 1-4 of a spot: team 1 holds 1 (drive) and 2 (revés), team 2 holds 3 and 4. */
export function spotPosition({ team, side }: Spot): number {
  return (team - 1) * 2 + (side === 'drive' ? 1 : 2);
}

export const allSpots: Spot[] = [
  { team: 1, side: 'drive' },
  { team: 1, side: 'reves' },
  { team: 2, side: 'drive' },
  { team: 2, side: 'reves' },
];

export function isTaken(session: CourtSession, spot: Spot): boolean {
  return session.booking?.taken_positions.includes(spotPosition(spot)) ?? false;
}

export type JoinOffer =
  { kind: 'off' } | { kind: 'none' } | { kind: 'free_session' } | { kind: 'join' };

/** What the scan can offer: nothing (Smart Court off / nobody on court), a free session or a join. */
export function joinOffer(session: CourtSession): JoinOffer {
  if (session.ai_video === 'off') return { kind: 'off' };
  if (session.booking) return { kind: 'join' };
  return session.free_session_allowed ? { kind: 'free_session' } : { kind: 'none' };
}

/** Payment gate by the club's mode: the club pays, or the player needs Pro / a paid match. */
export function needsPayment(session: CourtSession): boolean {
  return (
    session.ai_video === 'player_pays' &&
    !session.player_has_access &&
    session.extra_amount_cents !== null
  );
}

export function useCourtSession(service: CourtJoinService, courtId: string) {
  return useQuery({
    queryKey: ['court-session', courtId],
    queryFn: async () => courtSessionSchema.parse(await service.resolve(courtId)),
  });
}

export function useJoinCourt(service: CourtJoinService, courtId: string) {
  return useMutation({ mutationFn: (position: number) => service.join(courtId, position) });
}

export type CheckoutRequest = Schema<'CheckoutRequest'>;

/** Client-generated UUID for `Idempotency-Key`: one per intended payment, not a secret. */
export function newIdempotencyKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16),
  );
}
