export interface SetScore {
  team_1: number;
  team_2: number;
}

export interface ScoreRules {
  bestOfSets: number;
  superTiebreak: boolean;
}

function validSet(s: SetScore, superTiebreak: boolean): boolean {
  const hi = Math.max(s.team_1, s.team_2);
  const lo = Math.min(s.team_1, s.team_2);
  if (superTiebreak) return hi >= 10 && hi - lo >= 2 && (hi === 10 || hi - lo === 2);
  return (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6));
}

/**
 * Winner (1 or 2) of a final score, or null when the score is impossible: a set outside the
 * padel set scores, a deciding super tie-break played when the match was already decided,
 * more sets than the format allows, or no winner yet.
 */
export function winnerOf(sets: readonly SetScore[], rules: ScoreRules): 1 | 2 | null {
  const toWin = Math.ceil(rules.bestOfSets / 2);
  let won1 = 0;
  let won2 = 0;
  for (const [i, s] of sets.entries()) {
    if (won1 === toWin || won2 === toWin) return null;
    const deciding = rules.superTiebreak && i === rules.bestOfSets - 1;
    if (!validSet(s, deciding)) return null;
    if (s.team_1 > s.team_2) won1++;
    else won2++;
  }
  if (won1 === toWin) return 1;
  if (won2 === toWin) return 2;
  return null;
}
