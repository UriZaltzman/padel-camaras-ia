"""The hand-written rule cases of ``tests/rules``: how many there are and that each cites a rule."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

RULES_DIR = Path(__file__).resolve().parents[2] / "tests" / "rules"
MINIMUM_CASES = 60
"""Acceptance bar of issue #138 (spec section 14)."""


def _cases(name: str) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = yaml.safe_load((RULES_DIR / name).read_text(encoding="utf-8"))
    return cases


def test_there_are_at_least_sixty_cases() -> None:
    total = len(_cases("point_rules.yaml")) + len(_cases("scoring_rules.yaml"))
    assert total >= MINIMUM_CASES


def test_every_case_has_a_unique_id_and_cites_its_rule() -> None:
    cases = _cases("point_rules.yaml") + _cases("scoring_rules.yaml")
    ids = [c["id"] for c in cases]
    assert len(ids) == len(set(ids))
    assert all(str(c["rule"]).strip() for c in cases)
    assert all(c["expect"] is not None for c in cases)


def test_every_closing_rule_has_a_case() -> None:
    rules = {part for c in _cases("point_rules.yaml") for part in str(c["rule"]).split("/")}
    assert {f"R{n}" for n in range(1, 8)} <= rules
    assert {f"A{n}" for n in (1, 2, 3, 4, 5, 6, 7, 8, 9)} <= rules
