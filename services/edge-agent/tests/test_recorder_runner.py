import io
import logging
import sqlite3
import sys
import threading
from collections.abc import Iterator, Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from pydantic import SecretStr

from edge_agent.logs import JsonFormatter
from edge_agent.recorder.catalog import spans_between
from edge_agent.recorder.continuity import find_gaps
from edge_agent.recorder.runner import Recorder, backoff_delay, popen_launcher
from edge_agent.recorder.segments import segment_name
from edge_agent.store import open_store

LEAK_MARKER = "hunter2"
CAMERAS = {
    "court-1-a": SecretStr(f"rtsp://admin:{LEAK_MARKER}@10.0.0.11/stream1"),
    "court-1-b": SecretStr(f"rtsp://admin:{LEAK_MARKER}@10.0.0.12/stream1"),
}
T0 = datetime(2026, 10, 17, 22, 58, tzinfo=UTC)


class FakeProcess:
    def __init__(self, command: Sequence[str]) -> None:
        self.command = list(command)
        self.code: int | None = None

    @property
    def list_path(self) -> Path:
        return Path(self.command[self.command.index("-segment_list") + 1])

    @property
    def out_dir(self) -> Path:
        return Path(self.command[-1]).parent

    def write_segment(self, camera: str, started: datetime, start_s: float, end_s: float) -> None:
        name = segment_name(camera, started)
        (self.out_dir / name).write_bytes(b"\x47" * 188)
        with self.list_path.open("a", encoding="utf-8") as f:
            f.write(f"{name},{start_s:.6f},{end_s:.6f}\n")

    def poll(self) -> int | None:
        return self.code

    def terminate(self) -> None:
        self.code = 255

    def kill(self) -> None:
        self.code = -9

    def wait(self, timeout: float | None = None) -> int:
        return self.code if self.code is not None else 0


class Harness:
    def __init__(self, tmp_path: Path, conn: sqlite3.Connection) -> None:
        self.now = T0
        self.mono = 0.0
        self.due: frozenset[str] = frozenset()
        self.launched: list[tuple[str, FakeProcess]] = []
        self.fail_launch = False
        self.recorder = Recorder(
            CAMERAS,
            tmp_path / "segments",
            conn,
            "ffmpeg",
            desired=lambda _now: self.due,
            launcher=self.launch,
            wall_clock=lambda: self.now,
            clock=lambda: self.mono,
        )

    def launch(self, command: Sequence[str], camera: str) -> FakeProcess:
        if self.fail_launch:
            raise FileNotFoundError(2, "No such file", "ffmpeg")
        process = FakeProcess(command)
        self.launched.append((camera, process))
        return process

    def advance(self, seconds: float) -> None:
        self.now += timedelta(seconds=seconds)
        self.mono += seconds

    def last(self, camera: str) -> FakeProcess:
        return [p for c, p in self.launched if c == camera][-1]


@pytest.fixture
def conn(tmp_path: Path) -> Iterator[sqlite3.Connection]:
    connection = open_store(tmp_path / "edge.sqlite3")
    yield connection
    connection.close()


@pytest.fixture
def harness(tmp_path: Path, conn: sqlite3.Connection) -> Harness:
    return Harness(tmp_path, conn)


def test_starts_only_due_cameras_and_stops_them(harness: Harness) -> None:
    harness.recorder.tick()
    assert harness.launched == []

    harness.due = frozenset({"court-1-a"})
    harness.recorder.tick()
    assert harness.recorder.recording() == frozenset({"court-1-a"})
    process = harness.last("court-1-a")
    assert process.out_dir.name == "court-1-a"
    assert process.list_path.parent.is_dir()

    harness.due = frozenset()
    harness.recorder.tick()
    assert harness.recorder.recording() == frozenset()
    assert process.code is not None  # terminated


def test_saves_closed_segments_once(harness: Harness, conn: sqlite3.Connection) -> None:
    harness.due = frozenset({"court-1-a"})
    harness.recorder.tick()
    process = harness.last("court-1-a")
    for i in range(3):
        process.write_segment("court-1-a", T0 + timedelta(seconds=10 * i), 10.0 * i, 10.0 * (i + 1))
        harness.recorder.tick()
    harness.recorder.tick()

    rows = conn.execute("SELECT camera, duration_ms, size_bytes FROM segments").fetchall()
    assert rows == [("court-1-a", 10_000, 188)] * 3
    assert (
        find_gaps(
            spans_between(conn, "court-1-a", T0, T0 + timedelta(seconds=30)),
            T0,
            T0 + timedelta(seconds=30),
        )
        == []
    )


def test_segment_closed_on_stop_is_saved(harness: Harness, conn: sqlite3.Connection) -> None:
    harness.due = frozenset({"court-1-a"})
    harness.recorder.tick()
    process = harness.last("court-1-a")
    original_terminate = process.terminate

    def terminate_and_flush() -> None:
        process.write_segment("court-1-a", T0, 0.0, 4.0)
        original_terminate()

    process.terminate = terminate_and_flush  # type: ignore[method-assign]
    harness.recorder.shutdown()

    assert conn.execute("SELECT COUNT(*) FROM segments").fetchone()[0] == 1


def test_restarts_dead_camera_with_backoff_and_a_new_list(
    harness: Harness, conn: sqlite3.Connection
) -> None:
    harness.due = frozenset({"court-1-a"})
    harness.recorder.tick()
    first = harness.last("court-1-a")
    first.write_segment("court-1-a", T0, 0.0, 10.0)
    first.code = 1  # camera lost power

    harness.advance(0.5)
    harness.recorder.tick()
    assert harness.recorder.recording() == frozenset()
    assert conn.execute("SELECT COUNT(*) FROM segments").fetchone()[0] == 1

    harness.advance(backoff_delay(1))
    harness.recorder.tick()
    second = harness.last("court-1-a")
    assert second is not first
    assert second.list_path != first.list_path


def test_unexpected_or_missing_files_are_skipped(
    harness: Harness, conn: sqlite3.Connection
) -> None:
    harness.due = frozenset({"court-1-a"})
    harness.recorder.tick()
    process = harness.last("court-1-a")
    with process.list_path.open("a", encoding="utf-8") as f:
        f.write("court-1-b-20261017T225800Z.ts,0,10\n")  # another camera's name
        f.write("court-1-a-20261017T225810Z.ts,10,20\n")  # file not on disk
    harness.recorder.tick()

    assert conn.execute("SELECT COUNT(*) FROM segments").fetchone()[0] == 0


def test_launch_failure_is_retried(harness: Harness) -> None:
    harness.due = frozenset({"court-1-a"})
    harness.fail_launch = True
    harness.recorder.tick()
    assert harness.recorder.recording() == frozenset()

    harness.fail_launch = False
    harness.recorder.tick()
    assert harness.launched == []  # still backing off
    harness.advance(backoff_delay(1))
    harness.recorder.tick()
    assert harness.recorder.recording() == frozenset({"court-1-a"})


def test_run_stops_when_until_is_true(harness: Harness) -> None:
    harness.due = frozenset(CAMERAS)
    ticks = iter([False, False, True])
    harness.recorder.run(threading.Event(), interval=0, until=lambda: next(ticks))

    assert len(harness.launched) == 2
    assert harness.recorder.recording() == frozenset()


def test_backoff() -> None:
    assert [backoff_delay(n) for n in range(6)] == [0.0, 1.0, 2.0, 4.0, 8.0, 10.0]


@pytest.fixture
def captured_logs() -> Iterator[io.StringIO]:
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    old_level = root.level
    root.addHandler(handler)
    root.setLevel(logging.DEBUG)
    yield stream
    root.removeHandler(handler)
    root.setLevel(old_level)


def test_never_logs_camera_credentials(harness: Harness, captured_logs: io.StringIO) -> None:
    harness.due = frozenset(CAMERAS)
    harness.recorder.tick()
    harness.last("court-1-a").code = 1
    harness.advance(1)
    harness.recorder.tick()
    harness.fail_launch = True
    harness.advance(60)
    harness.recorder.tick()
    harness.recorder.shutdown()

    logs = captured_logs.getvalue()
    assert "recorder_camera_started" in logs
    assert LEAK_MARKER not in logs
    assert "10.0.0.11" not in logs


def test_ffmpeg_output_is_logged_with_credentials_masked(captured_logs: io.StringIO) -> None:
    # Stands in for FFmpeg printing the camera URL in an error message.
    script = (
        "import sys; sys.stderr.write("
        f"'rtsp://admin:{LEAK_MARKER}@10.0.0.11/stream1: Connection refused\\n')"
    )
    process = popen_launcher([sys.executable, "-c", script], "court-1-a")
    process.wait(timeout=10)
    deadline = datetime.now(UTC) + timedelta(seconds=5)
    while "recorder_ffmpeg_output" not in captured_logs.getvalue():
        assert datetime.now(UTC) < deadline, "FFmpeg output was not logged"
        threading.Event().wait(0.05)

    logs = captured_logs.getvalue()
    assert LEAK_MARKER not in logs
    assert "rtsp://***@10.0.0.11/stream1" in logs
