"""Stages must be able to write their output to Parquet and read it back unchanged."""

from __future__ import annotations

from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from pydantic import ValidationError

from ml.parquet_io import (
    RecordTypeMismatchError,
    Stage,
    read_records,
    read_stage,
    stage_path,
    write_records,
    write_stage,
)
from ml.schemas import (
    BallObservation,
    BallPosition,
    BounceEvent,
    Camera,
    CourtPosition,
    CourtSide,
    PlayerDetection,
    ShotEvent,
    ShotType,
    Surface,
    TrackedPlayer,
)


def _detections() -> list[PlayerDetection]:
    return [
        PlayerDetection(
            camera=Camera.A,
            frame=0,
            time_ms=0,
            confidence=0.91,
            foot=CourtPosition(x_m=2.5, y_m=3.0),
        ),
        PlayerDetection(
            camera=Camera.B,
            frame=1,
            time_ms=33,
            confidence=0.62,
            foot=CourtPosition(x_m=7.4, y_m=16.2),
        ),
    ]


def test_round_trip_keeps_records(tmp_path: Path) -> None:
    records = _detections()
    path = tmp_path / "players.parquet"
    write_records(records, PlayerDetection, path)
    assert read_records(PlayerDetection, path) == records


def test_round_trip_with_optional_and_enum_fields(tmp_path: Path) -> None:
    shots = [
        ShotEvent(
            time_ms=1200,
            track_id=2,
            player_position=CourtPosition(x_m=5.0, y_m=18.0),
            ball_position=BallPosition(x_m=5.1, y_m=18.2, z_m=1.4),
            shot_type=ShotType.BANDEJA,
            shot_type_confidence=0.83,
            confidence=0.9,
        ),
        ShotEvent(
            time_ms=2400,
            track_id=0,
            player_position=CourtPosition(x_m=4.0, y_m=2.0),
            ball_position=BallPosition(x_m=4.2, y_m=2.1),
            confidence=0.75,
        ),
    ]
    path = write_stage(tmp_path, Stage.SHOTS, shots, ShotEvent)
    assert path == tmp_path / "shots.parquet"
    loaded = read_stage(tmp_path, Stage.SHOTS, ShotEvent)
    assert loaded == shots
    assert loaded[1].shot_type is ShotType.UNKNOWN
    assert loaded[1].ball_position.z_m is None


def test_round_trip_of_other_stage_records(tmp_path: Path) -> None:
    ball = [
        BallObservation(
            frame=10,
            time_ms=333,
            confidence=0.7,
            position=BallPosition(x_m=3.0, y_m=9.0),
            interpolated=True,
        )
    ]
    bounces = [
        BounceEvent(
            time_ms=500,
            surface=Surface.BACK_GLASS,
            position=BallPosition(x_m=6.0, y_m=20.0, z_m=1.1),
            side=CourtSide.B,
            confidence=0.8,
        )
    ]
    tracks = [
        TrackedPlayer(
            camera=Camera.A,
            frame=3,
            time_ms=100,
            confidence=0.88,
            foot=CourtPosition(x_m=1.0, y_m=1.0),
            track_id=3,
        )
    ]
    write_stage(tmp_path, Stage.BALL, ball, BallObservation)
    write_stage(tmp_path, Stage.BOUNCES, bounces, BounceEvent)
    write_stage(tmp_path, Stage.TRACKS, tracks, TrackedPlayer)
    assert read_stage(tmp_path, Stage.BALL, BallObservation) == ball
    assert read_stage(tmp_path, Stage.BOUNCES, BounceEvent) == bounces
    assert read_stage(tmp_path, Stage.TRACKS, TrackedPlayer) == tracks


def test_empty_stage_round_trips(tmp_path: Path) -> None:
    write_stage(tmp_path, Stage.BOUNCES, [], BounceEvent)
    assert read_stage(tmp_path, Stage.BOUNCES, BounceEvent) == []


def test_reading_with_the_wrong_record_type_fails(tmp_path: Path) -> None:
    write_stage(tmp_path, Stage.PLAYERS, _detections(), PlayerDetection)
    with pytest.raises(RecordTypeMismatchError):
        read_stage(tmp_path, Stage.PLAYERS, TrackedPlayer)


def test_file_without_record_type_fails(tmp_path: Path) -> None:
    path = tmp_path / "foreign.parquet"
    pq.write_table(pa.table({"x": [1]}), path)
    with pytest.raises(RecordTypeMismatchError, match="unknown records"):
        read_records(PlayerDetection, path)


def test_writing_mixed_record_types_fails(tmp_path: Path) -> None:
    tracked = TrackedPlayer(
        camera=Camera.A,
        frame=0,
        time_ms=0,
        confidence=0.9,
        foot=CourtPosition(x_m=0.0, y_m=0.0),
        track_id=1,
    )
    with pytest.raises(TypeError):
        write_records([*_detections(), tracked], PlayerDetection, tmp_path / "p.parquet")


def test_write_creates_parent_dirs_and_leaves_no_temp_file(tmp_path: Path) -> None:
    work_dir = tmp_path / "match" / "run"
    write_stage(work_dir, Stage.PLAYERS, _detections(), PlayerDetection)
    assert sorted(p.name for p in work_dir.iterdir()) == ["players.parquet"]


def test_stage_paths_are_distinct(tmp_path: Path) -> None:
    paths = {stage_path(tmp_path, stage) for stage in Stage}
    assert len(paths) == len(Stage)


def test_records_reject_invalid_values() -> None:
    with pytest.raises(ValidationError):
        PlayerDetection(
            camera=Camera.A,
            frame=-1,
            time_ms=0,
            confidence=0.5,
            foot=CourtPosition(x_m=0.0, y_m=0.0),
        )
    with pytest.raises(ValidationError):
        BounceEvent(
            time_ms=0,
            surface=Surface.FLOOR,
            position=BallPosition(x_m=0.0, y_m=0.0),
            side=CourtSide.A,
            confidence=1.2,
        )
