"""Match state with serve rotation and side changes (spec section 6, "Marcador").

``ml.scoring`` already turns a list of point winners into games, sets, golden point and
tie-breaks. This module wraps the same rules in an immutable, hashable ``MatchState`` that can
move one point at a time, so the alignment of the correction layers can search over states, and
adds the two things ``Score`` does not carry: who serves each point and when the pairs change
sides.

Rotation: the service order is ``[A1, B1, A2, B2]``; game ``g`` (a tie-break counts as one
game) is served by ``order[g]``. Inside a tie-break the first player serves one point and then
the order advances every ``tiebreak_serve_run_points`` points. Sides change after the first
game of a set and then every second game, and in a tie-break every
``tiebreak_side_change_points`` points and once more when it ends.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field, replace
from functools import cache

from ml.labels import Team
from ml.point.events import Position
from ml.schemas import CourtSide
from ml.scoring import MatchFormat, Pair, _Tracker
from ml.thresholds import ScoringRules


@dataclass(frozen=True)
class MatchSetup:
    """Who plays, who serves first and where the pairs start."""

    team_players: tuple[tuple[Position, Position], tuple[Position, Position]]
    first_server: Position
    """Serves the first game; must belong to the pair that serves first."""
    second_server: Position
    """Serves the second game; must belong to the other pair."""
    team_one_side: CourtSide = CourtSide.A

    @property
    def team_of(self) -> dict[Position, Team]:
        one, two = self.team_players
        return {**dict.fromkeys(one, Team.ONE), **dict.fromkeys(two, Team.TWO)}

    @property
    def service_order(self) -> tuple[Position, ...]:
        """First server of each game, in order: A1, B1, A2, B2."""
        teams = self.team_of
        partner = {
            p: next(q for q in self.team_of if q != p and teams[q] is teams[p]) for p in teams
        }
        return (
            self.first_server,
            self.second_server,
            partner[self.first_server],
            partner[self.second_server],
        )


@dataclass(frozen=True)
class MatchState:
    """The score plus the counters the rotation needs. Equal scores give equal states."""

    sets: tuple[Pair, ...] = ()
    games: Pair = (0, 0)
    points: Pair = (0, 0)
    tiebreak: bool = False
    super_tiebreak: bool = False
    winner: Team | None = None
    game_count: int = 0
    """Games finished in the match; a tie-break counts as one."""
    points_after_end: int = 0
    side_changes: int = field(default=0, compare=False)
    """Informational: a state reached by two routes keeps whichever arrived first."""

    @property
    def over(self) -> bool:
        return self.winner is not None


@cache
def advance(state: MatchState, team: Team, rules: ScoringRules, fmt: MatchFormat) -> MatchState:
    """The state after ``team`` wins a point."""
    if state.winner is not None:
        return replace(state, points_after_end=state.points_after_end + 1)
    tracker = _Tracker(rules, fmt, list(state.sets), state.games, state.points)
    was_tiebreak = state.tiebreak
    tracker.add(team)
    game_done = (len(tracker.sets), tracker.games) != (len(state.sets), state.games)
    changes = state.side_changes
    if game_done:
        if was_tiebreak or (sum(state.games) + 1) % rules.side_change_every_games == 1:
            changes += 1
    elif was_tiebreak and sum(tracker.points) % rules.tiebreak_side_change_points == 0:
        changes += 1
    return MatchState(
        sets=tuple(tracker.sets),
        games=tracker.games,
        points=tracker.points,
        tiebreak=tracker.tiebreak,
        super_tiebreak=tracker.super_tiebreak,
        winner=tracker.winner,
        game_count=state.game_count + int(game_done),
        points_after_end=0,
        side_changes=changes,
    )


def server_of(state: MatchState, setup: MatchSetup, rules: ScoringRules) -> Position:
    """Player position that serves the next point."""
    order = setup.service_order
    turn = state.game_count
    if state.tiebreak:
        turn += (sum(state.points) + 1) // rules.tiebreak_serve_run_points
    return order[turn % len(order)]


def _opposite(side: CourtSide) -> CourtSide:
    return CourtSide.B if side is CourtSide.A else CourtSide.A


def team_side(state: MatchState, setup: MatchSetup, team: Team) -> CourtSide:
    """Half of the court where ``team`` stands for the next point."""
    one = setup.team_one_side
    team_one = _opposite(one) if state.side_changes % len(CourtSide) else one
    return team_one if team is Team.ONE else _opposite(team_one)


@dataclass(frozen=True)
class PointPlan:
    """What the rules say about one point before it is played."""

    number: int
    set_number: int
    game_number: int
    """1-based inside the set; the set's tie-break is game 13."""
    server: Position
    server_team: Team
    team_one_side: CourtSide
    state_before: MatchState


def plan_points(
    winners: Iterable[Team],
    setup: MatchSetup,
    rules: ScoringRules,
    fmt: MatchFormat,
) -> list[PointPlan]:
    """The plan of every point given the winners that were (or will be) played."""
    state = MatchState()
    teams = setup.team_of
    plans: list[PointPlan] = []
    for number, winner in enumerate(winners, start=1):
        server = server_of(state, setup, rules)
        plans.append(
            PointPlan(
                number=number,
                set_number=len(state.sets) + 1,
                game_number=sum(state.games) + 1,
                server=server,
                server_team=teams[server],
                team_one_side=team_side(state, setup, Team.ONE),
                state_before=state,
            )
        )
        state = advance(state, winner, rules, fmt)
    return plans


def replay(winners: Sequence[Team], rules: ScoringRules, fmt: MatchFormat) -> MatchState:
    state = MatchState()
    for winner in winners:
        state = advance(state, winner, rules, fmt)
    return state
