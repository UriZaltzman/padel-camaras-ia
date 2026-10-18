import io
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from edge_agent.recorder.catalog import record_segment
from edge_agent.recorder.cli import ScheduleSource, main
from edge_agent.recorder.schedule import MARGIN, ScheduleError
from edge_agent.recorder.settings import RecorderSettings, load_recorder_settings
from edge_agent.settings import SettingsError
from edge_agent.store import open_store

LEAK_MARKER = "hunter2"
CAMERAS_JSON = json.dumps(
    {
        "court-1-a": f"rtsp://admin:{LEAK_MARKER}@10.0.0.11/stream1",
        "court-1-b": f"rtsp://admin:{LEAK_MARKER}@10.0.0.12/stream1",
    }
)


def write_schedule(path: Path, shifts: list[dict[str, object]]) -> Path:
    path.write_text(json.dumps({"shifts": shifts}), encoding="utf-8")
    return path


def shift_json(shift_id: str, start: datetime, minutes: int = 90) -> dict[str, object]:
    return {
        "id": shift_id,
        "cameras": ["court-1-a", "court-1-b"],
        "start": start.isoformat(),
        "end": (start + timedelta(minutes=minutes)).isoformat(),
    }


def fill(
    data_dir: Path, camera: str, start: datetime, end: datetime, skip: int | None = None
) -> None:
    conn = open_store(data_dir / "edge-agent.sqlite3")
    try:
        count = int((end - start).total_seconds()) // 10
        for i in range(count):
            if i == skip:
                continue
            record_segment(
                conn,
                camera=camera,
                path=data_dir / camera / f"{i}.ts",
                started_at=start + timedelta(seconds=10 * i),
                duration_s=10.0,
                size_bytes=1,
            )
    finally:
        conn.close()


def test_settings_read_cameras_as_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EDGE_RECORDER_CAMERAS", CAMERAS_JSON)

    settings = load_recorder_settings()

    assert sorted(settings.cameras) == ["court-1-a", "court-1-b"]
    assert LEAK_MARKER not in repr(settings)
    assert settings.segments_root(Path("/data")) == Path("/data/segments")


@pytest.mark.parametrize(
    "cameras",
    [
        {},
        {"court-1-a": f"http://admin:{LEAK_MARKER}@10.0.0.11/x"},
        {"court-1-a": f"rtsp://admin:{LEAK_MARKER}@"},
        {"Court 1": "rtsp://10.0.0.11/x"},
    ],
)
def test_invalid_cameras_never_echo_the_url(
    monkeypatch: pytest.MonkeyPatch, cameras: dict[str, str]
) -> None:
    monkeypatch.setenv("EDGE_RECORDER_CAMERAS", json.dumps(cameras))

    with pytest.raises(SettingsError) as raised:
        load_recorder_settings()
    assert LEAK_MARKER not in str(raised.value)
    assert "EDGE_RECORDER_CAMERAS" in str(raised.value)


def test_missing_cameras() -> None:
    with pytest.raises(SettingsError, match="EDGE_RECORDER_CAMERAS: missing"):
        load_recorder_settings()


def test_check_window_ok_and_with_gap(valid_env: Path) -> None:
    start = datetime(2026, 10, 17, 23, 0, tzinfo=UTC)
    end = start + timedelta(minutes=5)
    fill(valid_env, "court-1-a", start, end)
    fill(valid_env, "court-1-b", start, end, skip=7)
    out = io.StringIO()

    code = main(
        [
            "check",
            "--camera",
            "court-1-a",
            "--camera",
            "court-1-b",
            "--from",
            start.isoformat(),
            "--to",
            end.isoformat(),
        ],
        out=out,
    )

    lines = out.getvalue().splitlines()
    assert code == 1
    assert lines[0] == "window\tcourt-1-a\tok\t30 segments"
    assert lines[1].startswith("window\tcourt-1-b\tGAPS\t2026-10-17T23:01:10+00:00..")


def test_check_schedule_includes_margins_and_skips_unfinished(
    valid_env: Path, tmp_path: Path
) -> None:
    done = datetime(2026, 1, 10, 20, 0, tzinfo=UTC)
    future = datetime.now(UTC) + timedelta(days=1)
    schedule = write_schedule(
        tmp_path / "s.json", [shift_json("t1", done, minutes=10), shift_json("t2", future)]
    )
    for camera in ("court-1-a", "court-1-b"):
        fill(valid_env, camera, done - MARGIN, done + timedelta(minutes=10) + MARGIN)
    out = io.StringIO()

    code = main(["check", "--schedule", str(schedule)], out=out)

    assert code == 0, out.getvalue()
    assert out.getvalue().splitlines() == [
        "t1\tcourt-1-a\tok\t84 segments",
        "t1\tcourt-1-b\tok\t84 segments",
        "t2\t-\tnot finished yet",
    ]


def test_check_schedule_detects_missing_margin(valid_env: Path, tmp_path: Path) -> None:
    done = datetime(2026, 1, 10, 20, 0, tzinfo=UTC)
    schedule = write_schedule(tmp_path / "s.json", [shift_json("t1", done, minutes=10)])
    for camera in ("court-1-a", "court-1-b"):
        fill(valid_env, camera, done, done + timedelta(minutes=10))  # no margins recorded

    assert main(["check", "--schedule", str(schedule)], out=io.StringIO()) == 1


def test_check_needs_a_window(valid_env: Path) -> None:
    assert main(["check", "--camera", "court-1-a"], out=io.StringIO()) == 1


def test_record_rejects_unconfigured_camera(
    valid_env: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("EDGE_RECORDER_CAMERAS", CAMERAS_JSON)

    assert main(["record", "--camera", "court-9-a", "--minutes", "90"]) == 1
    assert "court-9-a" in capsys.readouterr().err


def test_record_needs_camera_settings(valid_env: Path) -> None:
    assert main(["record", "--camera", "court-1-a", "--minutes", "90"]) == 2


def test_run_rejects_schedule_with_unknown_camera(
    valid_env: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("EDGE_RECORDER_CAMERAS", json.dumps({"court-1-a": "rtsp://10.0.0.11/x"}))
    schedule = write_schedule(tmp_path / "s.json", [shift_json("t1", datetime.now(UTC))])

    assert main(["run", "--schedule", str(schedule)]) == 1


def test_missing_agent_settings() -> None:
    assert main(["check", "--camera", "court-1-a"]) == 2


def test_schedule_source_reloads_and_keeps_last_good(tmp_path: Path) -> None:
    start = datetime(2026, 10, 17, 23, 0, tzinfo=UTC)
    path = write_schedule(tmp_path / "s.json", [shift_json("t1", start)])
    source = ScheduleSource(path, frozenset({"court-1-a", "court-1-b"}))
    inside = start + timedelta(minutes=1)
    both = frozenset({"court-1-a", "court-1-b"})

    assert source(inside) == both
    assert source(start - MARGIN - timedelta(seconds=1)) == frozenset()

    path.write_text("{broken", encoding="utf-8")
    assert source(inside) == both  # keeps recording with the last valid schedule

    write_schedule(path, [])
    assert source(inside) == frozenset()


def test_schedule_source_rejects_unknown_cameras(tmp_path: Path) -> None:
    path = write_schedule(tmp_path / "s.json", [shift_json("t1", datetime.now(UTC))])

    with pytest.raises(ScheduleError, match="not configured"):
        ScheduleSource(path, frozenset({"court-1-a"}))


def test_settings_model_accepts_rtsps() -> None:
    settings = RecorderSettings(cameras={"court-1-a": "rtsps://cam.local:322/live"})  # type: ignore[dict-item]

    assert settings.cameras["court-1-a"].get_secret_value().startswith("rtsps://")
