import type { Schema } from '@app/contracts';

export type Tournament = Schema<'Tournament'>;
export type TournamentDetail = Schema<'TournamentDetail'>;
export type TournamentPair = Schema<'TournamentPair'>;
export type TournamentMatch = Schema<'TournamentMatch'>;
export type TournamentGroup = Schema<'TournamentGroup'>;
export type TournamentPoints = Schema<'TournamentPoints'>;
export type TournamentStage = Schema<'TournamentStage'>;
export type SetScore = Schema<'TournamentSetScore'>;

export const CATEGORIES = [1, 2, 3, 4, 5, 6] as const;
export const KNOCKOUT_STAGES: TournamentStage[] = ['round_of_16', 'quarter', 'semi', 'final'];

/** Same defaults the API applies when `points` is left out. */
export const DEFAULT_POINTS: TournamentPoints = {
  champion: 100,
  finalist: 60,
  semifinal: 36,
  quarterfinal: 18,
  group_win: 5,
};

/** Group 0 → "A", 1 → "B"... */
export const groupLetter = (position: number) => String.fromCharCode(65 + position);

export function pairName(pairs: TournamentPair[], id: string | null): string | null {
  const pair = pairs.find((p) => p.id === id);
  return pair ? pair.players.map((p) => p.name).join(' / ') : null;
}

/** Knockout matches of one stage, in the order the API returns them. */
export const stageMatches = (matches: TournamentMatch[], stage: TournamentStage) =>
  matches.filter((m) => m.stage === stage);

/** Stages present in the fixture, first round to final. */
export const knockoutStages = (matches: TournamentMatch[]) =>
  KNOCKOUT_STAGES.filter((s) => matches.some((m) => m.stage === s));

/**
 * Same rule the API enforces on a padel match: best of three sets, a set ends 6-0..6-4, 7-5 or
 * 7-6, and no set is played once one side has two.
 */
export function validSets(sets: SetScore[]): boolean {
  if (sets.length < 2 || sets.length > 3) return false;
  let one = 0;
  let two = 0;
  for (const s of sets) {
    if (one === 2 || two === 2) return false;
    const hi = Math.max(s.team_1, s.team_2);
    const lo = Math.min(s.team_1, s.team_2);
    const done = (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6));
    if (!done) return false;
    if (s.team_1 > s.team_2) one += 1;
    else two += 1;
  }
  return one === 2 || two === 2;
}

/** A club-local date and time (`YYYY-MM-DD`, `HH:MM`) as the UTC instant of Buenos Aires (UTC-3). */
export const localToIso = (date: string, time: string) =>
  new Date(`${date}T${time}:00-03:00`).toISOString();

/** `"15.000"`-style pesos typed by a person to cents; null when it is not a whole amount. */
export function parseFeeToCents(input: string): number | null {
  const digits = input.replace(/[.\s$]/g, '');
  if (digits === '') return 0;
  return /^\d{1,9}$/.test(digits) ? Number(digits) * 100 : null;
}

export function inviteLink(clubId: string, tournamentId: string, origin: string): string {
  return `${origin}/clubes/${clubId}/torneos/${tournamentId}`;
}
