"""The thresholds file must match the typed loader exactly."""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import pytest
import yaml
from pydantic import BaseModel, ValidationError

from ml.thresholds import DEFAULT_THRESHOLDS_PATH, Thresholds, load_thresholds


def _raw() -> dict[str, Any]:
    with DEFAULT_THRESHOLDS_PATH.open(encoding="utf-8") as handle:
        data: dict[str, Any] = yaml.safe_load(handle)
    return data


def _leaf_keys() -> list[tuple[str, str]]:
    return [(section, key) for section, values in _raw().items() for key in values]


def _write(tmp_path: Path, data: dict[str, Any]) -> Path:
    path = tmp_path / "thresholds.yaml"
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    return path


def test_repository_file_loads() -> None:
    thresholds = load_thresholds()
    assert isinstance(thresholds, Thresholds)


def test_initial_values_match_the_spec() -> None:
    t = load_thresholds()
    assert t.players.min_confidence == 0.5
    assert t.tracking.bytetrack_match_threshold == 0.5
    assert t.tracking.track_memory_s == 2.0
    assert t.ball.min_heatmap_peak == 0.5
    assert t.ball.kalman_max_gap_frames == 10
    assert t.shots.min_direction_change_deg == 35.0
    assert t.shots.max_wrist_distance_m == 1.2
    assert t.shot_type.min_confidence == 0.6
    assert t.point.min_confidence == 0.7
    assert t.stats.coverage_uncovered_distance_m == 3.0
    assert t.stats.net_unguarded_distance_m == 4.0
    assert (
        t.highlights.weight_rally_length,
        t.highlights.weight_smash_or_vibora_winner,
        t.highlights.weight_ball_speed,
        t.highlights.weight_key_point,
    ) == (0.4, 0.3, 0.2, 0.1)
    assert t.lesson_mode.min_out_of_range_share == 0.4
    assert t.calibration.max_mean_error_cm == 5.0
    assert t.calibration.court_mask_margin_m == 1.5


def test_every_model_field_is_in_the_file() -> None:
    raw = _raw()
    assert set(raw) == set(Thresholds.model_fields)
    for section, info in Thresholds.model_fields.items():
        section_model = info.annotation
        assert isinstance(section_model, type)
        assert issubclass(section_model, BaseModel)
        assert set(raw[section]) == set(section_model.model_fields), section


@pytest.mark.parametrize(("section", "key"), _leaf_keys())
def test_missing_key_fails(tmp_path: Path, section: str, key: str) -> None:
    data = copy.deepcopy(_raw())
    del data[section][key]
    with pytest.raises(ValidationError, match=key):
        load_thresholds(_write(tmp_path, data))


@pytest.mark.parametrize("section", list(Thresholds.model_fields))
def test_missing_section_fails(tmp_path: Path, section: str) -> None:
    data = copy.deepcopy(_raw())
    del data[section]
    with pytest.raises(ValidationError, match=section):
        load_thresholds(_write(tmp_path, data))


@pytest.mark.parametrize(("section", "key"), _leaf_keys())
def test_string_value_fails(tmp_path: Path, section: str, key: str) -> None:
    data = copy.deepcopy(_raw())
    data[section][key] = str(data[section][key])
    with pytest.raises(ValidationError, match=key):
        load_thresholds(_write(tmp_path, data))


@pytest.mark.parametrize(("section", "key"), _leaf_keys())
def test_boolean_value_fails(tmp_path: Path, section: str, key: str) -> None:
    data = copy.deepcopy(_raw())
    data[section][key] = True
    with pytest.raises(ValidationError, match=key):
        load_thresholds(_write(tmp_path, data))


def test_float_in_integer_field_fails(tmp_path: Path) -> None:
    data = copy.deepcopy(_raw())
    data["ball"]["kalman_max_gap_frames"] = 10.5
    with pytest.raises(ValidationError, match="kalman_max_gap_frames"):
        load_thresholds(_write(tmp_path, data))


def test_unknown_key_fails(tmp_path: Path) -> None:
    data = copy.deepcopy(_raw())
    data["ball"]["min_heatmap_peek"] = 0.5
    with pytest.raises(ValidationError, match="min_heatmap_peek"):
        load_thresholds(_write(tmp_path, data))


def test_probability_out_of_range_fails(tmp_path: Path) -> None:
    data = copy.deepcopy(_raw())
    data["players"]["min_confidence"] = 1.5
    with pytest.raises(ValidationError, match="min_confidence"):
        load_thresholds(_write(tmp_path, data))


def test_highlight_weights_must_add_up_to_one(tmp_path: Path) -> None:
    data = copy.deepcopy(_raw())
    data["highlights"]["weight_key_point"] = 0.2
    with pytest.raises(ValidationError, match="add up to 1"):
        load_thresholds(_write(tmp_path, data))


def test_reel_duration_range_must_be_ordered(tmp_path: Path) -> None:
    data = copy.deepcopy(_raw())
    data["reel"]["min_duration_s"] = 40.0
    with pytest.raises(ValidationError, match="min_duration_s"):
        load_thresholds(_write(tmp_path, data))


def test_thresholds_are_immutable() -> None:
    t = load_thresholds()
    with pytest.raises(ValidationError):
        t.players.min_confidence = 0.9  # type: ignore[misc]
