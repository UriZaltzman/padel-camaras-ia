from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import yaml
from pydantic import ValidationError

from ml.holdout import (
    HoldoutLeakError,
    HoldoutRegistry,
    assert_no_holdout_in_training,
    load_holdout,
)


def _match(match_id: str, lighting: str = "day", court: str = "c1") -> dict[str, Any]:
    return {
        "match_id": match_id,
        "recorded_on": "2026-11-01",
        "club_id": "club-1",
        "court_id": court,
        "lighting": lighting,
    }


def _registry(matches: list[dict[str, Any]], **overrides: Any) -> HoldoutRegistry:
    raw: dict[str, Any] = {
        "version": 1,
        "required_matches": 4,
        "min_day_matches": 1,
        "min_night_matches": 1,
        "min_distinct_courts": 2,
        "matches": matches,
    }
    raw.update(overrides)
    return HoldoutRegistry.model_validate(raw)


def test_versioned_file_loads_and_follows_spec() -> None:
    registry = load_holdout()
    assert registry.required_matches == 15
    assert len(registry.matches) <= registry.required_matches


def test_loader_reads_yaml(tmp_path: Path) -> None:
    path = tmp_path / "holdout.yaml"
    raw = {
        "version": 2,
        "required_matches": 2,
        "min_day_matches": 1,
        "min_night_matches": 1,
        "min_distinct_courts": 1,
        "matches": [_match("m1"), _match("m2", "night")],
    }
    path.write_text(yaml.safe_dump(raw), encoding="utf-8")
    registry = load_holdout(path)
    assert registry.version == 2
    assert registry.match_ids == {"m1", "m2"}
    assert registry.is_complete


def test_loader_rejects_unknown_keys(tmp_path: Path) -> None:
    path = tmp_path / "holdout.yaml"
    path.write_text("version: 1\nunexpected: true\n", encoding="utf-8")
    with pytest.raises(ValidationError):
        load_holdout(path)


def test_rejects_duplicate_ids() -> None:
    with pytest.raises(ValidationError, match="duplicate"):
        _registry([_match("m1"), _match("m1", "night")])


def test_rejects_more_matches_than_required() -> None:
    with pytest.raises(ValidationError):
        _registry([_match(f"m{i}") for i in range(5)])


def test_rejects_bad_lighting() -> None:
    with pytest.raises(ValidationError):
        _registry([_match("m1", "dusk")])


def test_rejects_impossible_mix() -> None:
    with pytest.raises(ValidationError):
        _registry([], min_day_matches=3, min_night_matches=3)


def test_missing_requirements_reports_mix() -> None:
    registry = _registry([_match("m1"), _match("m2")])
    problems = registry.missing_requirements()
    assert not registry.is_complete
    assert any("night" in p for p in problems)
    assert any("courts" in p for p in problems)
    assert any("2 of 4" in p for p in problems)


def test_guard_raises_on_leak() -> None:
    registry = _registry([_match("m1"), _match("m2", "night")])
    with pytest.raises(HoldoutLeakError) as info:
        assert_no_holdout_in_training(["t1", "m2", "t3"], registry)
    assert info.value.leaked == ("m2",)


def test_guard_accepts_clean_training_set() -> None:
    registry = _registry([_match("m1")])
    assert_no_holdout_in_training(iter(["t1", "t2"]), registry)


def test_guard_defaults_to_versioned_file() -> None:
    registry = load_holdout()
    assert_no_holdout_in_training(["not-a-holdout-id"])
    if registry.matches:
        with pytest.raises(HoldoutLeakError):
            assert_no_holdout_in_training([registry.matches[0].match_id])
