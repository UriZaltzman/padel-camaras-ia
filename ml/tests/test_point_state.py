"""Scoring, serve rotation and side changes: the cases of ``tests/rules/scoring_rules.yaml``."""

from __future__ import annotations

import random
from pathlib import Path
from typing import Any

import pytest
import yaml

from ml.labels import Team
from ml.point.state import MatchSetup, MatchState, advance, plan_points, replay, server_of
from ml.scoring import ADVANTAGE_CALL, GAME_CALLS, MatchFormat, reconstruct_score
from ml.thresholds import load_thresholds

ROOT = Path(__file__).resolve().parents[2]
CASES: list[dict[str, Any]] = yaml.safe_load(
    (ROOT / "tests" / "rules" / "scoring_rules.yaml").read_text(encoding="utf-8")
)
RULES = load_thresholds().scoring
SETUP = MatchSetup(team_players=((1, 2), (3, 4)), first_server=1, second_server=3)


def _winners(text: str) -> list[Team]:
    return [Team(c) for c in text if c in "12"]


def _format(raw: dict[str, Any] | None) -> MatchFormat:
    raw = raw or {}
    return MatchFormat(golden_point=bool(raw.get("golden")), super_tiebreak=bool(raw.get("super")))


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["id"])
def test_scoring_case(case: dict[str, Any]) -> None:
    fmt = _format(case.get("format"))
    state = replay(_winners(case["winners"]), RULES, fmt)
    expect = case["expect"]
    if "points" in expect:
        assert list(state.points) == expect["points"]
    if "games" in expect:
        assert list(state.games) == expect["games"]
    if "sets" in expect:
        assert [list(s) for s in state.sets] == expect["sets"]
    if "tiebreak" in expect:
        assert state.tiebreak is expect["tiebreak"]
    if "super_tiebreak" in expect:
        assert state.super_tiebreak is expect["super_tiebreak"]
    if "winner" in expect:
        assert (state.winner.value if state.winner else None) == (
            str(expect["winner"]) if expect["winner"] else None
        )
    if "server" in expect:
        assert server_of(state, SETUP, RULES) == expect["server"]
    if "swaps" in expect:
        assert state.side_changes == expect["swaps"]
    if "calls" in expect or "deuce" in expect:
        score = reconstruct_score(_winners(case["winners"]), RULES, fmt)
        if "calls" in expect:
            assert score.calls == tuple(expect["calls"])
        if "deuce" in expect:
            assert score.deuce is expect["deuce"]


def test_call_names_are_the_scoring_ones() -> None:
    assert set(GAME_CALLS) >= {"love", "fifteen", "thirty", "forty"}
    assert ADVANTAGE_CALL == "advantage"


@pytest.mark.parametrize("seed", range(40))
def test_state_agrees_with_the_reference_scorer(seed: int) -> None:
    rng = random.Random(seed)
    fmt = MatchFormat(golden_point=rng.random() < 0.5, super_tiebreak=rng.random() < 0.5)
    bias = rng.uniform(0.3, 0.7)
    winners = [Team.ONE if rng.random() < bias else Team.TWO for _ in range(400)]
    state = MatchState()
    for i, winner in enumerate(winners, start=1):
        state = advance(state, winner, RULES, fmt)
        ref = reconstruct_score(winners[:i], RULES, fmt)
        assert (state.sets, state.games, state.points, state.winner) == (
            ref.sets,
            ref.games,
            ref.points,
            ref.winner,
        )


def test_plan_gives_set_game_and_server_per_point() -> None:
    winners = _winners("1111 2222 1111")
    plans = plan_points(winners, SETUP, RULES, MatchFormat())
    assert [p.server for p in plans[::4]] == [1, 3, 2]
    assert [p.game_number for p in plans[::4]] == [1, 2, 3]
    assert all(p.set_number == 1 for p in plans)


def test_tie_break_is_game_thirteen() -> None:
    winners = _winners("1111 2222 " * 6 + "1")
    assert plan_points(winners, SETUP, RULES, MatchFormat())[-1].game_number == 13


def test_every_player_serves_equally_over_a_long_set() -> None:
    winners = _winners("1111 2222 " * 6)
    servers = [p.server for p in plan_points(winners, SETUP, RULES, MatchFormat())]
    assert {s: servers.count(s) for s in set(servers)} == {1: 12, 2: 12, 3: 12, 4: 12}


def test_points_after_the_match_are_counted_not_scored() -> None:
    fmt = MatchFormat()
    state = replay(_winners("1" * 48 + "22"), RULES, fmt)
    assert state.winner is Team.ONE
    assert state.points_after_end == 2
