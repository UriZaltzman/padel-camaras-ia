"""Correction layer 2: per-point confidence, review flags and the contract shape."""

from __future__ import annotations

import json

import pytest
from layer_helpers import EXAMPLE, RULES, TH
from rules_dsl import TEAM_OF, parse_events
from simulator import simulate_match

from ml.labels import PointEndReason
from ml.point.contract import CONTRACT_END_REASON, to_result_point
from ml.point.events import RawPoint
from ml.point.machine import PointMachine
from ml.point.pipeline import ALL_LAYERS, Layer, MatchResult, analyze

# -- layer 2: confidence and the contract --------------------------------------------------


def test_points_below_the_threshold_are_flagged() -> None:
    match = simulate_match(5, RULES)
    result = analyze(match.events, match.setup, match.fmt, TH, layers=frozenset({Layer.CONFIDENCE}))
    for point in result.points:
        assert point.needs_review == (point.confidence < TH.point.min_confidence)


def test_confidence_is_the_product_of_the_deciding_events() -> None:
    machine = PointMachine(dict(TEAM_OF), TH.point)
    points: list[RawPoint] = []
    for event in parse_events(
        ["serve 1 @0 c=0.9", "floor B box @500 c=0.8", "floor B @1300 c=0.5"]
    ):
        points += machine.feed(event)
    points += machine.flush()
    assert points[0].confidence == pytest.approx(0.9 * 0.8 * 0.5)


def test_results_follow_the_contract_shape() -> None:
    match = simulate_match(6, RULES)
    result = analyze(match.events, match.setup, match.fmt, TH, final=match.final)
    example = json.loads(EXAMPLE.read_text(encoding="utf-8"))["points"][0]
    for point in result.points:
        entry = to_result_point(point)
        assert set(entry) == set(example)
        assert entry["number"] >= 1
        assert entry["winner_team"] in {1, 2}
        assert isinstance(entry["needs_review"], bool)
        assert (entry["deciding_event"] is None) or set(entry["deciding_event"]) == {
            "kind",
            "index",
        }


def test_every_end_reason_maps_to_a_contract_reason() -> None:
    contract = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    allowed = {p["end_reason"] for p in contract["points"]} | {
        "double_fault",
        "own_floor_before_net",
        "net",
        "rival_wall_before_floor",
        "double_bounce",
        "out_after_bounce",
        "ball_lost",
    }
    assert set(CONTRACT_END_REASON) == set(PointEndReason)
    assert set(CONTRACT_END_REASON.values()) <= allowed


def test_clean_match_is_scored_exactly() -> None:
    match = simulate_match(7, RULES)
    result: MatchResult = analyze(
        match.events, match.setup, match.fmt, TH, layers=ALL_LAYERS, final=match.final
    )
    assert result.sets == match.final.sets
    assert [p.winner for p in result.points] == match.winners
    assert not result.corrections
