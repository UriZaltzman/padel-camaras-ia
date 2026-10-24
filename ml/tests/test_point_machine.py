"""Point state machine: the hand-written rule cases of ``tests/rules/point_rules.yaml``."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import yaml
from rules_dsl import TEAM_OF, parse_events

from ml.labels import PointEndReason, Team
from ml.point.events import BallSurface, RawPoint
from ml.point.machine import PointMachine
from ml.point.rules import RuleOptions
from ml.thresholds import load_thresholds

CASES_PATH = Path(__file__).resolve().parents[2] / "tests" / "rules" / "point_rules.yaml"
CASES: list[dict[str, Any]] = yaml.safe_load(CASES_PATH.read_text(encoding="utf-8"))
THRESHOLDS = load_thresholds().point


def _options(raw: dict[str, Any] | None) -> RuleOptions:
    values = dict(raw or {})
    if "serve_fault_walls" in values:
        values["serve_fault_walls"] = frozenset(BallSurface(w) for w in values["serve_fault_walls"])
    return RuleOptions(**values)


def run_case(case: dict[str, Any]) -> list[RawPoint]:
    machine = PointMachine(dict(TEAM_OF), THRESHOLDS, _options(case.get("options")))
    points: list[RawPoint] = []
    for event in parse_events(case["events"]):
        points += machine.feed(event)
    if "finish" in case:
        points += machine.finish(case["finish"])
    return points


def test_case_ids_are_unique_and_cite_a_rule() -> None:
    ids = [c["id"] for c in CASES]
    assert len(ids) == len(set(ids))
    assert all(str(c["rule"]).strip() for c in CASES)


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["id"])
def test_rule_case(case: dict[str, Any]) -> None:
    points = run_case(case)
    got = [
        {"winner": int(p.winner.value), "reason": p.reason.value, "faults": p.serve_faults}
        for p in points
    ]
    assert got == case["expect"]


def test_ball_lost_points_are_low_confidence() -> None:
    lost = next(c for c in CASES if c["id"] == "ball-never-seen-after-rival-floor-hitter-wins")
    (point,) = run_case(lost)
    assert point.reason is PointEndReason.BALL_LOST
    assert point.winner is Team.TWO
    assert point.confidence < THRESHOLDS.min_confidence


def test_inferred_events_lower_the_confidence() -> None:
    plain = next(c for c in CASES if c["id"] == "two-floor-bounces-on-the-rival-half")
    inferred = next(c for c in CASES if c["id"] == "unseen-return-is-inferred-from-the-landing")
    assert run_case(inferred)[0].confidence < run_case(plain)[0].confidence
