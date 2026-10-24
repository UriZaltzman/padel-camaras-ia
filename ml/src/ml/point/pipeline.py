"""The whole point engine: events in, scored points out (spec section 6).

``analyze`` runs the state machine and then the correction layers the caller asks for:

* layer 1, ``serve_coherence``: edit the winners so the observed servers match the rotation
* layer 2, ``confidence``: flag the points below ``point.min_confidence``
* layer 3, ``final_score``: edit the winners so the match ends in the score a player entered

Every change is returned in ``MatchResult.corrections`` so it can be stored for retraining.
"""

from __future__ import annotations

from collections.abc import Sequence
from enum import IntEnum, auto
from typing import Annotated, Self

from pydantic import Field, model_validator

from ml.labels import PointEndReason, Team
from ml.point.align import (
    AlignConfig,
    Alignment,
    Correction,
    EditKind,
    Observed,
    align,
)
from ml.point.events import EventRef, Position, RallyEvent, RawPoint
from ml.point.machine import PointMachine
from ml.point.rules import RuleOptions
from ml.point.state import MatchSetup, MatchState, advance, plan_points, replay
from ml.schemas import StageRecord
from ml.scoring import MatchFormat, Pair
from ml.thresholds import ScoringRules, Thresholds


class Layer(IntEnum):
    SERVE_COHERENCE = auto()
    CONFIDENCE = auto()
    FINAL_SCORE = auto()


ALL_LAYERS = frozenset(Layer)


class FinalScore(StageRecord):
    """The result a player entered: games of each set, pair 1 first.

    A super tie-break counts as a set won 1-0 (see ``docs/ml/rules-ambiguities.md``, A10).
    """

    sets: tuple[tuple[Annotated[int, Field(ge=0)], Annotated[int, Field(ge=0)]], ...]
    games: tuple[int, int] = (0, 0)
    """Games of the unfinished set, for a match that was stopped."""

    @model_validator(mode="after")
    def _not_empty(self) -> Self:
        if not self.sets and self.games == (0, 0):
            msg = "a final score needs at least one game"
            raise ValueError(msg)
        return self

    def accepts(self, state: MatchState) -> bool:
        return state.sets == self.sets and state.games == self.games

    def viable(self, state: MatchState) -> bool:
        """Whether ``state`` can still reach this score by adding points."""
        done = len(state.sets)
        if done > len(self.sets) or state.sets != self.sets[:done]:
            return False
        goal: Pair = self.sets[done] if done < len(self.sets) else self.games
        return state.games[0] <= goal[0] and state.games[1] <= goal[1]


class ScoredPoint(StageRecord):
    """A point in the form of the match-results contract (``ResultPoint``) plus its origin."""

    number: Annotated[int, Field(ge=1)]
    set_number: Annotated[int, Field(ge=1)]
    game_number: Annotated[int, Field(ge=1)]
    server_position: Position
    serve_faults: Annotated[int, Field(ge=0)]
    winner: Team
    reason: PointEndReason
    deciding_event: EventRef | None
    confidence: Annotated[float, Field(ge=0.0, le=1.0)]
    needs_review: bool
    start_ms: Annotated[int, Field(ge=0)]
    end_ms: Annotated[int, Field(ge=0)]
    corrected: EditKind | None = None
    """``flip`` or ``insert`` when a layer changed or created this point."""
    pair_one_side_a: bool
    """Whether pair 1 stands on side A while the point is played."""


class MatchResult(StageRecord):
    points: tuple[ScoredPoint, ...]
    sets: tuple[tuple[int, int], ...]
    games: tuple[int, int]
    points_in_game: tuple[int, int]
    winner: Team | None
    corrections: tuple[Correction, ...]
    raw_point_count: int


def _observed(points: Sequence[RawPoint]) -> list[Observed]:
    return [Observed(p.winner, p.confidence, p.server_team, p.server_player) for p in points]


def _apply(
    points: Sequence[RawPoint],
    marks_in: Sequence[EditKind | None],
    alignment: Alignment,
    layer: Layer,
    inserted_confidence: float,
) -> tuple[list[RawPoint], list[Correction], list[EditKind | None]]:
    """Rebuild the point list after an alignment; returns the points, log and edit marks."""
    out: list[RawPoint] = []
    marks: list[EditKind | None] = []
    log: list[Correction] = []
    previous_end = 0
    for step in alignment.steps:
        index = step.observed_index
        if step.kind is EditKind.KEEP:
            point = points[index]
            out.append(point)
            marks.append(marks_in[index])
            previous_end = point.end_ms
        elif step.kind is EditKind.FLIP:
            point = points[index]
            assert step.winner is not None  # noqa: S101 - a flip always has a winner
            out.append(
                point.model_copy(
                    update={"winner": step.winner, "confidence": 1.0 - point.confidence}
                )
            )
            marks.append(marks_in[index] or EditKind.FLIP)
            previous_end = point.end_ms
            log.append(
                Correction(
                    layer=layer,
                    kind=EditKind.FLIP,
                    observed_index=index,
                    winner_before=point.winner,
                    winner_after=step.winner,
                    cost=step.cost,
                )
            )
        elif step.kind is EditKind.DELETE:
            log.append(
                Correction(
                    layer=layer,
                    kind=EditKind.DELETE,
                    observed_index=index,
                    winner_before=points[index].winner,
                    winner_after=None,
                    cost=step.cost,
                )
            )
        else:
            assert step.winner is not None  # noqa: S101 - an insert always has a winner
            following = points[index].start_ms if index < len(points) else previous_end
            start = min(previous_end, following)
            out.append(
                RawPoint(
                    start_ms=start,
                    end_ms=max(following, start + 1),
                    winner=step.winner,
                    reason=PointEndReason.BALL_LOST,
                    confidence=inserted_confidence,
                    serve_faults=0,
                    server_player=None,
                    server_team=None,
                    deciding_event=None,
                )
            )
            marks.append(EditKind.INSERT)
            log.append(
                Correction(
                    layer=layer,
                    kind=EditKind.INSERT,
                    observed_index=index,
                    winner_before=None,
                    winner_after=step.winner,
                    cost=step.cost,
                )
            )
    return out, log, marks


def run_machine(
    events: Sequence[RallyEvent],
    setup: MatchSetup,
    thresholds: Thresholds,
    options: RuleOptions | None = None,
    end_ms: int | None = None,
) -> list[RawPoint]:
    """Layer 0: the 7 rules only, no correction."""
    machine = PointMachine(setup.team_of, thresholds.point, options or RuleOptions())
    points: list[RawPoint] = []
    for event in sorted(events, key=lambda e: e.time_ms):
        points += machine.feed(event)
    points += machine.finish(end_ms)
    return points


def analyze(
    events: Sequence[RallyEvent],
    setup: MatchSetup,
    fmt: MatchFormat,
    thresholds: Thresholds,
    *,
    layers: frozenset[Layer] = ALL_LAYERS,
    final: FinalScore | None = None,
    options: RuleOptions | None = None,
    end_ms: int | None = None,
    check_server_player: bool = False,
) -> MatchResult:
    """Run the state machine and the requested correction layers."""
    raw = run_machine(events, setup, thresholds, options, end_ms)
    points = list(raw)
    marks: list[EditKind | None] = [None] * len(points)
    log: list[Correction] = []
    rules = thresholds.scoring
    inserted = thresholds.point.inserted_point_confidence

    def cfg(*, use_serve: bool) -> AlignConfig:
        return AlignConfig(
            setup, rules, fmt, thresholds.point, use_serve=use_serve,
            check_player=check_server_player,
        )  # fmt: skip

    if Layer.SERVE_COHERENCE in layers and points:
        result = align(_observed(points), cfg(use_serve=True))
        if result is not None:
            points, new_log, marks = _apply(points, marks, result, Layer.SERVE_COHERENCE, inserted)
            log += new_log
    if Layer.FINAL_SCORE in layers and final is not None:
        result = align(
            _observed(points),
            cfg(use_serve=True),
            accept=final.accepts,
            viable=final.viable,
        ) or align(
            _observed(points),
            cfg(use_serve=False),
            accept=final.accepts,
            viable=final.viable,
        )
        if result is not None:
            points, new_log, marks = _apply(points, marks, result, Layer.FINAL_SCORE, inserted)
        else:
            points, new_log, marks = _synthesize(final, rules, fmt, inserted)
        log += new_log
    return _build(
        points,
        marks=marks,
        log=log,
        raw_count=len(raw),
        setup=setup,
        fmt=fmt,
        thresholds=thresholds,
    )


def _games_in_order(first: tuple[int, int]) -> list[Team]:
    """Game winners of a set that ends ``first`` without the set closing early.

    The set's loser and winner alternate; the winner takes the games left at the end.
    """
    one, two = first
    loser, winner = (Team.TWO, Team.ONE) if one > two else (Team.ONE, Team.TWO)
    few, many = min(one, two), max(one, two)
    order: list[Team] = []
    for _ in range(few):
        order += [loser, winner]
    return order + [winner] * (many - few)


def _synthesize(
    final: FinalScore, rules: ScoringRules, fmt: MatchFormat, confidence: float
) -> tuple[list[RawPoint], list[Correction], list[EditKind | None]]:
    """The last resort: no alignment reaches the score, so write the shortest match that does."""
    state = MatchState()
    winners: list[Team] = []
    unfinished = [final.games] if final.games != (0, 0) else []
    for goal in [*final.sets, *unfinished]:
        for team in _games_in_order(goal):
            before = (len(state.sets), state.games)
            while (len(state.sets), state.games) == before:
                state = advance(state, team, rules, fmt)
                winners.append(team)
    points = [
        RawPoint(
            start_ms=0,
            end_ms=1,
            winner=team,
            reason=PointEndReason.BALL_LOST,
            confidence=confidence,
            serve_faults=0,
            server_player=None,
            server_team=None,
            deciding_event=None,
        )
        for team in winners
    ]
    log = [
        Correction(
            layer=Layer.FINAL_SCORE,
            kind=EditKind.INSERT,
            observed_index=0,
            winner_before=None,
            winner_after=team,
            cost=0.0,
        )
        for team in winners
    ]
    return points, log, [EditKind.INSERT] * len(points)


def _build(
    points: Sequence[RawPoint],
    *,
    marks: Sequence[EditKind | None],
    log: Sequence[Correction],
    raw_count: int,
    setup: MatchSetup,
    fmt: MatchFormat,
    thresholds: Thresholds,
) -> MatchResult:
    plans = plan_points([p.winner for p in points], setup, thresholds.scoring, fmt)
    review_below = thresholds.point.min_confidence
    scored = tuple(
        ScoredPoint(
            number=plan.number,
            set_number=plan.set_number,
            game_number=plan.game_number,
            server_position=plan.server,
            serve_faults=point.serve_faults,
            winner=point.winner,
            reason=point.reason,
            deciding_event=point.deciding_event,
            confidence=point.confidence,
            needs_review=point.confidence < review_below or mark is not None,
            start_ms=point.start_ms,
            end_ms=point.end_ms,
            corrected=mark,
            pair_one_side_a=plan.team_one_side.value == "A",
        )
        for plan, point, mark in zip(plans, points, marks, strict=True)
    )
    final_state = replay([p.winner for p in points], thresholds.scoring, fmt)
    return MatchResult(
        points=scored,
        sets=final_state.sets,
        games=final_state.games,
        points_in_game=final_state.points,
        winner=final_state.winner,
        corrections=tuple(log),
        raw_point_count=raw_count,
    )
