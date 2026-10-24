"""Correction layer 3: alignment to the final score a player entered."""

from __future__ import annotations

import random

import pytest
from layer_helpers import FMT, RULES, TH, cfg, truth, winners_of
from simulator import SETUP, simulate_match

from ml.labels import Team
from ml.point.align import EditKind, Observed, align
from ml.point.pipeline import FinalScore, Layer, analyze
from ml.point.state import replay
from ml.scoring import MatchFormat

# -- layer 3: final score ------------------------------------------------------------------


def _final(winners: list[Team]) -> FinalScore:
    return FinalScore(sets=replay(winners, RULES, FMT).sets)


@pytest.mark.parametrize("seed", range(8))
def test_entered_score_is_always_reproduced(seed: int) -> None:
    winners, observed = truth(seed)
    rng = random.Random(seed)
    damaged = [
        Observed(
            (Team.TWO if o.winner is Team.ONE else Team.ONE) if rng.random() < 0.15 else o.winner,
            rng.uniform(0.3, 0.9),
            o.server_team,
            o.server_player,
        )
        for o in observed
        if rng.random() > 0.05
    ]
    final = _final(winners)
    result = align(damaged, cfg(), accept=final.accepts, viable=final.viable)
    assert result is not None
    assert replay(winners_of(result.steps), RULES, FMT).sets == final.sets


@pytest.mark.parametrize(
    "sets",
    [((6, 0), (6, 0)), ((6, 4), (3, 6), (7, 6)), ((7, 5), (6, 7), (1, 0)), ((6, 3),)],
)
def test_score_is_reproduced_even_with_no_points_at_all(sets: tuple[tuple[int, int], ...]) -> None:
    fmt = MatchFormat(super_tiebreak=sets[-1] == (1, 0))
    result = analyze([], SETUP, fmt, TH, final=FinalScore(sets=sets))
    assert result.sets == sets
    assert result.points
    assert all(p.needs_review and p.corrected is EditKind.INSERT for p in result.points)
    assert len(result.corrections) == len(result.points)


def test_final_score_with_too_many_points_deletes_them() -> None:
    _, observed = truth(1)
    final = FinalScore(sets=((6, 0), (6, 0)))
    result = align(observed, cfg(use_serve=False), accept=final.accepts, viable=final.viable)
    assert result is not None
    assert replay(winners_of(result.steps), RULES, FMT).sets == final.sets


def test_final_score_validation() -> None:
    with pytest.raises(ValueError, match="at least one game"):
        FinalScore(sets=())
    assert FinalScore(sets=((6, 4),)).viable(replay([], RULES, FMT))


def test_corrections_are_recorded_for_retraining() -> None:
    match = simulate_match(4, RULES)
    # A clean stream with a wrong final score entered: layer 3 has to edit and say what it did.
    wrong = FinalScore(sets=((6, 0), (6, 0)))
    result = analyze(match.events, match.setup, match.fmt, TH, final=wrong, end_ms=match.end_ms)
    assert result.corrections
    assert all(c.layer == Layer.FINAL_SCORE for c in result.corrections)
    assert {c.kind for c in result.corrections} <= set(EditKind)
    assert result.sets == wrong.sets
    assert all(p.needs_review for p in result.points if p.corrected is not None)
