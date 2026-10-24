"""Correction layer 1: serve coherence (spec section 6)."""

from __future__ import annotations

import random

import pytest
from layer_helpers import FMT, RULES, TH, cfg, game_ending_indexes, truth, winners_of

from ml.labels import Team
from ml.point.align import EditKind, Observed, align
from ml.point.state import replay

# -- layer 1: serve coherence --------------------------------------------------------------


@pytest.mark.parametrize("seed", range(6))
def test_clean_input_needs_no_correction(seed: int) -> None:
    winners, observed = truth(seed)
    result = align(observed, cfg())
    assert result is not None
    assert result.cost == 0
    assert winners_of(result.steps) == winners


@pytest.mark.parametrize("seed", range(10))
def test_missing_game_ending_point_is_recovered(seed: int) -> None:
    """The last point of a game is gone: the next server does not match, layer 1 puts it back."""
    winners, observed = truth(seed)
    ends = game_ending_indexes(winners)
    victim = random.Random(seed).choice(ends[2:-3])
    broken = [o for i, o in enumerate(observed) if i != victim]
    result = align(broken, cfg())
    assert result is not None
    assert result.cost > 0
    assert replay(winners_of(result.steps), RULES, FMT).sets == replay(winners, RULES, FMT).sets


@pytest.mark.parametrize("seed", range(10))
def test_several_missing_points_recover_the_score(seed: int) -> None:
    winners, observed = truth(seed)
    rng = random.Random(seed)
    ends = game_ending_indexes(winners)
    victims = set(rng.sample(ends[1:-1], 3))
    broken = [o for i, o in enumerate(observed) if i not in victims]
    result = align(broken, cfg())
    assert result is not None
    final = replay(winners_of(result.steps), RULES, FMT)
    expected = replay(winners, RULES, FMT)
    assert (final.sets, final.winner) == (expected.sets, expected.winner)


def test_a_wrongly_read_server_is_not_worth_an_edit() -> None:
    winners, observed = truth(3)
    other = Team.TWO if observed[10].server_team is Team.ONE else Team.ONE
    observed[10] = Observed(winners[10], 0.9, other, None)
    result = align(observed, cfg())
    assert result is not None
    assert winners_of(result.steps) == winners
    assert result.cost == TH.point.server_mismatch_cost


def test_a_low_confidence_point_is_the_cheapest_to_flip() -> None:
    winners, observed = truth(2)
    ends = game_ending_indexes(winners)
    i = ends[3]
    flipped = Team.TWO if winners[i] is Team.ONE else Team.ONE
    # The game-ending point is read wrong: the game does not end and every later server is off.
    observed[i] = Observed(flipped, 0.4, observed[i].server_team, observed[i].server_player)
    result = align(observed, cfg())
    assert result is not None
    assert result.steps[i].kind is EditKind.FLIP
    assert replay(winners_of(result.steps), RULES, FMT).sets == replay(winners, RULES, FMT).sets
