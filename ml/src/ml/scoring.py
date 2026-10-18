"""Padel score from the winner of each point (spec section 6, "Marcador").

Pure functions with no I/O. The numbers of the rules (points per game, games per set,
tie-break lengths, sets to win) come from ``thresholds.yaml``; whether 40-40 is a golden
point and whether the deciding set is a super tie-break is a per-match setting.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

from ml.labels import Team
from ml.thresholds import ScoringRules

GAME_CALLS = ("love", "fifteen", "thirty", "forty")
"""How a game score is called, by points won; the page shows the es-AR text of each one."""
ADVANTAGE_CALL = "advantage"

type Pair = tuple[int, int]


@dataclass(frozen=True)
class MatchFormat:
    """Per-match scoring settings (``matches.punto de oro`` and the club's third set)."""

    golden_point: bool = False
    super_tiebreak: bool = False


@dataclass(frozen=True)
class Score:
    """The score after some points: finished sets, the current set and the current game."""

    sets: tuple[Pair, ...]
    """Games of each finished set, team 1 first."""
    games: Pair
    points: Pair
    """Points of the current game, or of the tie-break when ``tiebreak`` is true."""
    tiebreak: bool
    super_tiebreak: bool
    calls: tuple[str, str] | None
    """``GAME_CALLS`` / ``ADVANTAGE_CALL`` per team in a regular game; ``None`` in a tie-break."""
    deuce: bool
    """40-40: next point wins with golden point; otherwise someone needs an advantage."""
    winner: Team | None
    points_after_end: int
    """Points labeled after the match was already won: the labels or the setting are wrong."""

    @property
    def sets_won(self) -> Pair:
        one = sum(1 for a, b in self.sets if a > b)
        return one, len(self.sets) - one


def _index(team: Team) -> int:
    return 0 if team is Team.ONE else 1


def _bump(pair: Pair, team: Team) -> Pair:
    return (pair[0] + 1, pair[1]) if team is Team.ONE else (pair[0], pair[1] + 1)


@dataclass
class _Tracker:
    rules: ScoringRules
    fmt: MatchFormat
    sets: list[Pair] = field(default_factory=list)
    games: Pair = (0, 0)
    points: Pair = (0, 0)
    winner: Team | None = None
    points_after_end: int = 0

    def _sets_won(self, team: Team) -> int:
        i = _index(team)
        return sum(1 for s in self.sets if s[i] > s[1 - i])

    @property
    def super_tiebreak(self) -> bool:
        last = self.rules.sets_to_win - 1
        return (
            self.fmt.super_tiebreak
            and self._sets_won(Team.ONE) == last
            and self._sets_won(Team.TWO) == last
        )

    @property
    def tiebreak(self) -> bool:
        per_set = self.rules.games_per_set
        return self.super_tiebreak or self.games == (per_set, per_set)

    def _game_won(self, team: Team) -> bool:
        i = _index(team)
        mine, theirs = self.points[i], self.points[1 - i]
        lead = mine - theirs
        if self.tiebreak:
            target = (
                self.rules.super_tiebreak_points
                if self.super_tiebreak
                else self.rules.tiebreak_points
            )
            return mine >= target and lead >= self.rules.min_point_lead
        if mine < self.rules.points_per_game:
            return False
        return self.fmt.golden_point or lead >= self.rules.min_point_lead

    def _set_won(self, team: Team) -> bool:
        i = _index(team)
        mine, theirs = self.games[i], self.games[1 - i]
        if mine > self.rules.games_per_set:  # won the tie-break
            return True
        return mine >= self.rules.games_per_set and mine - theirs >= self.rules.min_game_lead

    def add(self, team: Team) -> None:
        if self.winner is not None:
            self.points_after_end += 1
            return
        was_super = self.super_tiebreak
        self.points = _bump(self.points, team)
        if not self._game_won(team):
            return
        self.points = (0, 0)
        self.games = _bump(self.games, team)
        if was_super or self._set_won(team):
            self.sets.append(self.games)
            self.games = (0, 0)
            if self._sets_won(team) == self.rules.sets_to_win:
                self.winner = team

    def _calls(self) -> tuple[tuple[str, str] | None, bool]:
        if self.tiebreak:
            return None, False
        one, two = self.points
        top = len(GAME_CALLS) - 1
        if min(one, two) >= top and not self.fmt.golden_point and one != two:
            leader = (ADVANTAGE_CALL, GAME_CALLS[top])
            return (leader if one > two else (leader[1], leader[0])), False
        calls = (GAME_CALLS[min(one, top)], GAME_CALLS[min(two, top)])
        return calls, min(one, two) >= top and one == two

    def snapshot(self) -> Score:
        calls, deuce = self._calls()
        return Score(
            sets=tuple(self.sets),
            games=self.games,
            points=self.points,
            tiebreak=self.tiebreak,
            super_tiebreak=self.super_tiebreak,
            calls=calls,
            deuce=deuce,
            winner=self.winner,
            points_after_end=self.points_after_end,
        )


def running_scores(winners: Iterable[Team], rules: ScoringRules, fmt: MatchFormat) -> list[Score]:
    """The score after each point, in order."""
    tracker = _Tracker(rules, fmt)
    scores = []
    for team in winners:
        tracker.add(team)
        scores.append(tracker.snapshot())
    return scores


def reconstruct_score(winners: Iterable[Team], rules: ScoringRules, fmt: MatchFormat) -> Score:
    """The score after all the points, given who won each one in order."""
    tracker = _Tracker(rules, fmt)
    for team in winners:
        tracker.add(team)
    return tracker.snapshot()
