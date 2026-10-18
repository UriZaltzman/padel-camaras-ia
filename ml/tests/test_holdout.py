from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import yaml
from pydantic import ValidationError
from uuid6 import uuid7

from ml.holdout import (
    HoldoutLeakError,
    HoldoutRegistry,
    assert_no_holdout_in_training,
    load_holdout,
)

M1, M2, M3 = (str(uuid7()) for _ in range(3))
T1, T2 = (str(uuid7()) for _ in range(2))
UUID4 = "6f1c2b9e-3d4a-4e5f-8a7b-9c0d1e2f3a4b"


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
        "match_id_uuid_version": 7,
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
        "match_id_uuid_version": 7,
        "required_matches": 2,
        "min_day_matches": 1,
        "min_night_matches": 1,
        "min_distinct_courts": 1,
        "matches": [_match(M1), _match(M2, "night")],
    }
    path.write_text(yaml.safe_dump(raw), encoding="utf-8")
    registry = load_holdout(path)
    assert registry.version == 2
    assert registry.match_ids == {M1, M2}
    assert registry.is_complete


def test_loader_rejects_unknown_keys(tmp_path: Path) -> None:
    path = tmp_path / "holdout.yaml"
    path.write_text("version: 1\nunexpected: true\n", encoding="utf-8")
    with pytest.raises(ValidationError):
        load_holdout(path)


def test_rejects_duplicate_ids() -> None:
    with pytest.raises(ValidationError, match="duplicate"):
        _registry([_match(M1), _match(M1, "night")])


def test_rejects_more_matches_than_required() -> None:
    with pytest.raises(ValidationError):
        _registry([_match(str(uuid7())) for _ in range(5)])


def test_rejects_bad_lighting() -> None:
    with pytest.raises(ValidationError):
        _registry([_match(M1, "dusk")])


def test_rejects_impossible_mix() -> None:
    with pytest.raises(ValidationError):
        _registry([], min_day_matches=3, min_night_matches=3)


def test_missing_requirements_reports_mix() -> None:
    registry = _registry([_match(M1), _match(M2)])
    problems = registry.missing_requirements()
    assert not registry.is_complete
    assert any("night" in p for p in problems)
    assert any("courts" in p for p in problems)
    assert any("2 of 4" in p for p in problems)


def test_guard_raises_on_leak() -> None:
    registry = _registry([_match(M1), _match(M2, "night")])
    with pytest.raises(HoldoutLeakError) as info:
        assert_no_holdout_in_training([T1, M2, M3], registry)
    assert info.value.leaked == (M2,)


def test_guard_accepts_clean_training_set() -> None:
    registry = _registry([_match(M1)])
    assert_no_holdout_in_training(iter([T1, T2]), registry)


def test_guard_defaults_to_versioned_file() -> None:
    registry = load_holdout()
    assert_no_holdout_in_training([T1])
    if registry.matches:
        with pytest.raises(HoldoutLeakError):
            assert_no_holdout_in_training([registry.matches[0].match_id])


def test_guard_rejects_single_string() -> None:
    registry = _registry([_match(M1)])
    with pytest.raises(TypeError):
        assert_no_holdout_in_training(M1, registry)
    with pytest.raises(TypeError):
        assert_no_holdout_in_training(M1.encode(), registry)


def test_guard_catches_whitespace_and_case_variants() -> None:
    registry = _registry([_match(M1)])
    for variant in (f"  {M1} ", M1.upper(), f"\t{M1.upper()}\n"):
        with pytest.raises(HoldoutLeakError) as info:
            assert_no_holdout_in_training([variant], registry)
        assert info.value.leaked == (M1,)


def test_registry_normalizes_ids() -> None:
    registry = _registry([_match(f" {M1.upper()} ")])
    assert registry.match_ids == {M1}
    with pytest.raises(HoldoutLeakError):
        assert_no_holdout_in_training([M1], registry)


@pytest.mark.parametrize("bad", ["m1", "", UUID4])
def test_guard_rejects_non_uuid7_input(bad: str) -> None:
    with pytest.raises(ValueError, match="UUID"):
        assert_no_holdout_in_training([bad], _registry([_match(M1)]))


@pytest.mark.parametrize("bad", ["m1", UUID4])
def test_registry_rejects_non_uuid7_ids(bad: str) -> None:
    with pytest.raises(ValidationError):
        _registry([_match(bad)])
