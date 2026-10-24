"""Dynamic-programming alignment shared by correction layers 1 and 3 (spec section 6).

The machine gives a list of observed points: a winner, a confidence and, when a serve was seen,
who served. The alignment searches the cheapest way to edit that list so that

* layer 1: every observed server is the one the rotation expects (serve coherence);
* layer 3: the match ends in the final score a player entered.

An edit is one of: *flip* the winner of an observed point, *delete* an observed point that
never happened, or *insert* a point the machine did not see. Flipping a point costs
``-ln(1 - confidence)``, so doubtful points are the first to change; deleting costs the same plus
``delete_penalty``; inserting costs ``insert_cost``. The search is a Viterbi over
``(observed point, match state)``. A server that does not match the rotation is not forbidden:
it costs ``server_mismatch_cost`` (the serve may simply have been read wrong). The search
keeps a beam of ``beam_width`` states.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from enum import StrEnum

from ml.labels import Team
from ml.point.events import Position
from ml.point.state import MatchSetup, MatchState, advance, server_of
from ml.schemas import StageRecord
from ml.scoring import MatchFormat
from ml.thresholds import PointThresholds, ScoringRules


class EditKind(StrEnum):
    KEEP = "keep"
    FLIP = "flip"
    DELETE = "delete"
    INSERT = "insert"


@dataclass(frozen=True)
class Observed:
    """One point as the machine closed it."""

    winner: Team
    confidence: float
    server_team: Team | None
    server_player: Position | None


class Correction(StageRecord):
    """A change a layer made, kept so the models can be retrained on it."""

    layer: int
    kind: EditKind
    observed_index: int
    """Index of the observed point; for an insert, the point it was inserted before."""
    winner_before: Team | None
    winner_after: Team | None
    cost: float


@dataclass(frozen=True)
class Step:
    kind: EditKind
    observed_index: int
    winner: Team | None
    """Winner in the aligned list; ``None`` for a deletion."""
    cost: float


@dataclass(frozen=True)
class Alignment:
    steps: tuple[Step, ...]
    cost: float
    final_state: MatchState


type Accept = Callable[[MatchState], bool]
type Viable = Callable[[MatchState], bool]


@dataclass(frozen=True)
class AlignConfig:
    setup: MatchSetup
    rules: ScoringRules
    fmt: MatchFormat
    point: PointThresholds
    use_serve: bool = True
    check_player: bool = False


def _flip_cost(confidence: float, cap: float) -> float:
    return -math.log(1.0 - min(confidence, cap))


def _serve_ok(state: MatchState, obs: Observed, cfg: AlignConfig) -> bool:
    if not cfg.use_serve or obs.server_team is None:
        return True
    expected = server_of(state, cfg.setup, cfg.rules)
    if cfg.setup.team_of[expected] is not obs.server_team:
        return False
    return not (
        cfg.check_player and obs.server_player is not None and expected != obs.server_player
    )


def _other(team: Team) -> Team:
    return Team.TWO if team is Team.ONE else Team.ONE


type _Node = tuple["_Node | None", Step] | None
type _Layer = dict[MatchState, tuple[float, _Node]]


def _relax(layer: _Layer, state: MatchState, cost: float, node: _Node) -> bool:
    known = layer.get(state)
    if known is not None and known[0] <= cost:
        return False
    layer[state] = (cost, node)
    return True


def _prune(layer: _Layer, beam: int, viable: Viable | None) -> None:
    if viable is not None:
        for state in [s for s in layer if not viable(s)]:
            del layer[state]
    if len(layer) > beam:
        keep = sorted(layer.items(), key=lambda kv: kv[1][0])[:beam]
        layer.clear()
        layer.update(keep)


def align(
    observed: Sequence[Observed],
    cfg: AlignConfig,
    *,
    accept: Accept | None = None,
    viable: Viable | None = None,
) -> Alignment | None:
    """Cheapest edit of ``observed`` that satisfies the serve rotation and ``accept``.

    ``viable`` drops states that can no longer reach an accepted one. Returns ``None`` when no
    edit within the beam satisfies ``accept``.
    """
    point = cfg.point
    layers: list[_Layer] = [{MatchState(): (0.0, None)}]
    for i in range(len(observed) + 1):
        layer = layers[i]
        frontier = list(layer)
        for _ in range(point.max_inserts_per_gap):
            changed: list[MatchState] = []
            for state in frontier:
                if state.over:
                    continue
                base, parent = layer[state]
                for team in Team:
                    nxt = advance(state, team, cfg.rules, cfg.fmt)
                    step = Step(EditKind.INSERT, i, team, point.insert_cost)
                    if _relax(layer, nxt, base + point.insert_cost, (parent, step)):
                        changed.append(nxt)
            frontier = changed
            if not frontier:
                break
        _prune(layer, point.beam_width, viable)
        if i == len(observed):
            break
        obs = observed[i]
        flip = _flip_cost(obs.confidence, point.max_event_confidence)
        nxt_layer: _Layer = {}
        for state, (cost, parent) in layer.items():
            delete = Step(EditKind.DELETE, i, None, flip + point.delete_penalty)
            _relax(nxt_layer, state, cost + delete.cost, (parent, delete))
            if state.over:
                continue
            misread = 0.0 if _serve_ok(state, obs, cfg) else point.server_mismatch_cost
            keep = Step(EditKind.KEEP, i, obs.winner, misread)
            _relax(
                nxt_layer,
                advance(state, obs.winner, cfg.rules, cfg.fmt),
                cost + misread,
                (parent, keep),
            )
            other = _other(obs.winner)
            flipped = Step(EditKind.FLIP, i, other, flip + misread)
            _relax(
                nxt_layer,
                advance(state, other, cfg.rules, cfg.fmt),
                cost + flip + misread,
                (parent, flipped),
            )
        layers.append(nxt_layer)

    candidates = [(c, s, n) for s, (c, n) in layers[-1].items() if accept is None or accept(s)]
    if not candidates:
        return None
    cost, end, node = min(candidates, key=lambda c: c[0])
    steps: list[Step] = []
    while node is not None:
        parent, step = node
        steps.append(step)
        node = parent
    steps.reverse()
    return Alignment(tuple(steps), cost, end)
