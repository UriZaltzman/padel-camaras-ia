"""Label sets must round-trip through Parquet and reject invalid labels."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from ml.labels import (
    LABEL_SCHEMA_VERSION,
    BounceLabel,
    LabelKind,
    LabelSetExistsError,
    LabelSetInfo,
    MatchLabels,
    PointEndReason,
    PointLabel,
    ShotLabel,
    ShotTypeLabel,
    Team,
    UnsupportedLabelSchemaError,
    label_set_dir,
    list_label_set_versions,
    read_label_set,
    write_label_set,
)
from ml.parquet_io import RecordTypeMismatchError, read_records, write_records
from ml.schemas import Camera, CourtSide, ShotType, Surface

_VERSION_MASK = ~(0xF << 76) & ~(0x3 << 62)


def _uuid7() -> uuid.UUID:
    """A random UUID with the version 7 bits set (Python 3.12 has no ``uuid.uuid7``)."""
    raw = secrets.randbits(128) & _VERSION_MASK
    return uuid.UUID(int=raw | (0x7 << 76) | (0x2 << 62))


LABELER_ID = _uuid7()
LABELED_AT = datetime(2026, 10, 17, 15, 30, tzinfo=UTC)


def _info(match_id: uuid.UUID | None = None, version: int = 1) -> LabelSetInfo:
    return LabelSetInfo(
        match_id=match_id or _uuid7(),
        version=version,
        labeler=LABELER_ID,
        labeled_at=LABELED_AT,
    )


def _labels(info: LabelSetInfo | None = None) -> MatchLabels:
    serve = ShotLabel(id=_uuid7(), time_ms=1_000, track_id=0, camera=Camera.A)
    reply = ShotLabel(id=_uuid7(), time_ms=2_100, track_id=2, camera=Camera.B)
    smash = ShotLabel(id=_uuid7(), time_ms=9_800, track_id=1, camera=Camera.A)
    return MatchLabels(
        info=info or _info(),
        shots=(serve, reply, smash),
        bounces=(
            BounceLabel(
                id=_uuid7(), time_ms=1_500, surface=Surface.FLOOR, side=CourtSide.B, camera=Camera.B
            ),
            BounceLabel(
                id=_uuid7(),
                time_ms=1_800,
                surface=Surface.BACK_GLASS,
                side=CourtSide.B,
                camera=Camera.B,
            ),
            BounceLabel(
                id=_uuid7(),
                time_ms=10_200,
                surface=Surface.SIDE_GLASS,
                side=CourtSide.B,
                camera=Camera.B,
            ),
        ),
        shot_types=(
            ShotTypeLabel(shot_id=serve.id, shot_type=ShotType.SERVE),
            ShotTypeLabel(shot_id=reply.id, shot_type=ShotType.OFF_THE_WALL),
            ShotTypeLabel(shot_id=smash.id, shot_type=ShotType.UNKNOWN),
        ),
        points=(
            PointLabel(
                id=_uuid7(),
                number=1,
                start_ms=900,
                end_ms=8_000,
                winner=Team.ONE,
                end_reason=PointEndReason.DOUBLE_BOUNCE,
            ),
            PointLabel(
                id=_uuid7(),
                number=2,
                start_ms=9_500,
                end_ms=11_000,
                winner=Team.TWO,
                end_reason=PointEndReason.DIRECT_WALL,
            ),
        ),
    )


# Round trip


def test_label_set_round_trips(tmp_path: Path) -> None:
    labels = _labels()
    set_dir = write_label_set(tmp_path, labels)
    assert set_dir == label_set_dir(tmp_path, labels.info.match_id, labels.info.version)
    assert sorted(p.name for p in set_dir.iterdir()) == sorted(
        f"{kind.value}.parquet" for kind in LabelKind
    )
    loaded = read_label_set(tmp_path, labels.info.match_id, labels.info.version)
    assert loaded == labels
    assert loaded.info.labeled_at == LABELED_AT
    assert loaded.info.schema_version == LABEL_SCHEMA_VERSION


def test_empty_label_set_round_trips(tmp_path: Path) -> None:
    labels = MatchLabels(info=_info())
    write_label_set(tmp_path, labels)
    assert read_label_set(tmp_path, labels.info.match_id, labels.info.version) == labels


@pytest.mark.parametrize(
    ("record_type", "records"),
    [
        (ShotLabel, lambda labels: labels.shots),
        (BounceLabel, lambda labels: labels.bounces),
        (ShotTypeLabel, lambda labels: labels.shot_types),
        (PointLabel, lambda labels: labels.points),
        (LabelSetInfo, lambda labels: (labels.info,)),
    ],
    ids=lambda value: getattr(value, "__name__", ""),
)
def test_each_label_type_round_trips(tmp_path: Path, record_type: Any, records: Any) -> None:
    original = list(records(_labels()))
    path = tmp_path / "labels.parquet"
    write_records(original, record_type, path)
    assert read_records(record_type, path) == original


def test_every_surface_shot_type_and_end_reason_round_trips(tmp_path: Path) -> None:
    shots = tuple(
        ShotLabel(id=_uuid7(), time_ms=index, track_id=0, camera=Camera.A)
        for index, _ in enumerate(ShotType)
    )
    labels = MatchLabels(
        info=_info(),
        shots=shots,
        bounces=tuple(
            BounceLabel(
                id=_uuid7(), time_ms=index, surface=surface, side=CourtSide.A, camera=Camera.A
            )
            for index, surface in enumerate(Surface)
        ),
        shot_types=tuple(
            ShotTypeLabel(shot_id=shot.id, shot_type=shot_type)
            for shot, shot_type in zip(shots, ShotType, strict=True)
        ),
        points=tuple(
            PointLabel(
                id=_uuid7(),
                number=index + 1,
                start_ms=index * 10,
                end_ms=index * 10 + 5,
                winner=Team.ONE,
                end_reason=reason,
            )
            for index, reason in enumerate(PointEndReason)
        ),
    )
    write_label_set(tmp_path, labels)
    assert read_label_set(tmp_path, labels.info.match_id, labels.info.version) == labels


def test_versions_are_kept_and_latest_is_read_by_default(tmp_path: Path) -> None:
    match_id = _uuid7()
    first = _labels(_info(match_id, version=1))
    second = _labels(_info(match_id, version=2))
    write_label_set(tmp_path, second)
    write_label_set(tmp_path, first)
    assert list_label_set_versions(tmp_path, match_id) == [1, 2]
    assert read_label_set(tmp_path, match_id) == second
    assert read_label_set(tmp_path, match_id, version=1) == first


def test_existing_version_is_never_overwritten(tmp_path: Path) -> None:
    labels = _labels()
    write_label_set(tmp_path, labels)
    with pytest.raises(LabelSetExistsError):
        write_label_set(tmp_path, _labels(labels.info))


def test_reading_a_match_without_labels_fails(tmp_path: Path) -> None:
    assert list_label_set_versions(tmp_path, _uuid7()) == []
    with pytest.raises(FileNotFoundError):
        read_label_set(tmp_path, _uuid7())


def test_older_label_schema_is_rejected_on_read(tmp_path: Path) -> None:
    labels = MatchLabels(info=_info().model_copy(update={"schema_version": "0.9.0"}))
    write_label_set(tmp_path, labels)
    with pytest.raises(UnsupportedLabelSchemaError, match=r"0\.9\.0"):
        read_label_set(tmp_path, labels.info.match_id, labels.info.version)


def test_label_files_cannot_be_swapped(tmp_path: Path) -> None:
    labels = _labels()
    set_dir = write_label_set(tmp_path, labels)
    shots_path = set_dir / f"{LabelKind.SHOTS.value}.parquet"
    write_records(list(labels.bounces), BounceLabel, shots_path)
    with pytest.raises(RecordTypeMismatchError):
        read_label_set(tmp_path, labels.info.match_id, labels.info.version)


# Validation of each label type


def _rejects(model: type[Any], **fields: Any) -> None:
    with pytest.raises(ValidationError):
        model(**fields)


SHOT = {"id": _uuid7(), "time_ms": 0, "track_id": 0, "camera": Camera.A}


@pytest.mark.parametrize(
    "override",
    [
        {"time_ms": -1},
        {"track_id": -1},
        {"camera": "C"},
        {"id": uuid.uuid4()},
        {"id": "not-a-uuid"},
        {"player": "someone"},
    ],
)
def test_shot_label_rejects_invalid_values(override: dict[str, Any]) -> None:
    _rejects(ShotLabel, **{**SHOT, **override})


BOUNCE = {
    "id": _uuid7(),
    "time_ms": 0,
    "surface": Surface.FLOOR,
    "side": CourtSide.A,
    "camera": Camera.A,
}


@pytest.mark.parametrize(
    "override",
    [
        {"surface": "wall"},
        {"surface": "ceiling"},
        {"side": "C"},
        {"time_ms": -5},
        {"camera": "B2"},
    ],
)
def test_bounce_label_rejects_invalid_values(override: dict[str, Any]) -> None:
    _rejects(BounceLabel, **{**BOUNCE, **override})


@pytest.mark.parametrize(
    "override",
    [{"shot_type": "drop_shot"}, {"shot_type": ""}, {"shot_id": uuid.uuid4()}],
)
def test_shot_type_label_rejects_invalid_values(override: dict[str, Any]) -> None:
    _rejects(ShotTypeLabel, **{"shot_id": _uuid7(), "shot_type": ShotType.LOB, **override})


POINT = {
    "id": _uuid7(),
    "number": 1,
    "start_ms": 100,
    "end_ms": 200,
    "winner": Team.TWO,
    "end_reason": PointEndReason.NET,
}


@pytest.mark.parametrize(
    "override",
    [
        {"number": 0},
        {"start_ms": -1},
        {"end_ms": 100},
        {"end_ms": 50},
        {"winner": "3"},
        {"winner": "A"},
        {"end_reason": "let"},
    ],
)
def test_point_label_rejects_invalid_values(override: dict[str, Any]) -> None:
    _rejects(PointLabel, **{**POINT, **override})


INFO = {
    "match_id": _uuid7(),
    "version": 1,
    "labeler": LABELER_ID,
    "labeled_at": LABELED_AT,
}


@pytest.mark.parametrize(
    "override",
    [
        {"version": 0},
        {"labeler": ""},
        {"labeler": "   "},
        {"labeler": "Juan Pérez"},
        {"labeler": "juan.perez@example.com"},
        {"labeler": str(uuid.uuid4())},
        {"labeled_at": datetime(2026, 10, 17, 15, 30)},  # noqa: DTZ001
        {"labeled_at": datetime(2026, 10, 17, 12, 30, tzinfo=timezone(-timedelta(hours=3)))},
        {"schema_version": "v1"},
        {"match_id": uuid.uuid4()},
    ],
)
def test_label_set_info_rejects_invalid_values(override: dict[str, Any]) -> None:
    _rejects(LabelSetInfo, **{**INFO, **override})


def test_label_set_info_accepts_a_uuid7_labeler() -> None:
    labeler = _uuid7()
    assert LabelSetInfo.model_validate({**INFO, "labeler": labeler}).labeler == labeler
    assert LabelSetInfo.model_validate({**INFO, "labeler": str(labeler)}).labeler == labeler


def test_labels_are_immutable() -> None:
    shot = ShotLabel.model_validate(SHOT)
    with pytest.raises(ValidationError):
        shot.time_ms = 5  # type: ignore[misc]


# Consistency of a label set


def test_shot_type_for_an_unknown_shot_is_rejected() -> None:
    labels = _labels()
    stray = ShotTypeLabel(shot_id=_uuid7(), shot_type=ShotType.SMASH)
    with pytest.raises(ValidationError, match="unknown shots"):
        MatchLabels.model_validate({**dict(labels), "shot_types": (*labels.shot_types, stray)})


def test_a_shot_with_two_types_is_rejected() -> None:
    labels = _labels()
    again = ShotTypeLabel(shot_id=labels.shots[0].id, shot_type=ShotType.LOB)
    with pytest.raises(ValidationError, match="only one type"):
        MatchLabels.model_validate({**dict(labels), "shot_types": (*labels.shot_types, again)})


def test_repeated_label_ids_are_rejected() -> None:
    labels = _labels()
    clone = labels.shots[0].model_copy(update={"time_ms": 5_000})
    with pytest.raises(ValidationError, match="unique"):
        MatchLabels.model_validate({**dict(labels), "shots": (*labels.shots, clone)})


def test_repeated_point_numbers_are_rejected() -> None:
    labels = _labels()
    clone = labels.points[1].model_copy(update={"id": _uuid7(), "number": 1})
    with pytest.raises(ValidationError, match="point numbers"):
        MatchLabels.model_validate({**dict(labels), "points": (labels.points[0], clone)})


def test_overlapping_points_are_rejected() -> None:
    labels = _labels()
    early = labels.points[1].model_copy(update={"start_ms": 7_000})
    with pytest.raises(ValidationError, match="starts before"):
        MatchLabels.model_validate({**dict(labels), "points": (labels.points[0], early)})
