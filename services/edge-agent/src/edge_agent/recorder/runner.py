"""Keeps one FFmpeg recording per camera that must be recording right now.

Every tick it asks ``desired`` which cameras are due, starts FFmpeg for the ones that
are not recording (restarting with backoff if it dies, e.g. a camera that lost power),
stops the ones that are no longer due, and saves every closed segment in the store.

Each FFmpeg run writes its own segment list, so a restart never overwrites the list of
the previous run. FFmpeg's output goes through ``redact_credentials`` before it is
logged: it prints camera URLs, and they may hold passwords.
"""

import logging
import os
import sqlite3
import subprocess
import threading
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import IO, Final, Protocol

from pydantic import SecretStr

from edge_agent.recorder.catalog import record_segment
from edge_agent.recorder.ffmpeg import record_command
from edge_agent.recorder.segments import parse_segment_list, parse_segment_name
from edge_agent.redact import redact_credentials

BACKOFF_INITIAL_S: Final = 1.0
BACKOFF_MAX_S: Final = 10.0
HEALTHY_RUN_S: Final = 30.0
TERMINATE_TIMEOUT_S: Final = 10.0
TICK_INTERVAL_S: Final = 1.0
LISTS_DIRNAME: Final = ".lists"

logger = logging.getLogger("edge_agent.recorder")


class Process(Protocol):
    def poll(self) -> int | None: ...
    def terminate(self) -> None: ...
    def kill(self) -> None: ...
    def wait(self, timeout: float | None = None) -> int: ...


Launcher = Callable[[Sequence[str], str], Process]
Desired = Callable[[datetime], frozenset[str]]


def _forward_output(stream: IO[str], camera: str) -> None:
    with stream:
        for line in stream:
            text = line.rstrip()
            if text:
                logger.warning(
                    "recorder_ffmpeg_output",
                    extra={"camera": camera, "line": redact_credentials(text)},
                )


def popen_launcher(command: Sequence[str], camera: str) -> Process:
    """Run FFmpeg in UTC (segment names) and log its stderr with credentials masked."""
    process = subprocess.Popen(  # noqa: S603 - fixed argument list, no shell
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        errors="replace",
        env={**os.environ, "TZ": "UTC"},
    )
    if process.stderr is not None:
        threading.Thread(target=_forward_output, args=(process.stderr, camera), daemon=True).start()
    return process


def backoff_delay(failures: int) -> float:
    """Seconds to wait before restarting after ``failures`` quick exits in a row."""
    if failures <= 0:
        return 0.0
    return float(min(BACKOFF_INITIAL_S * 2 ** (failures - 1), BACKOFF_MAX_S))


@dataclass
class _Run:
    process: Process
    list_path: Path
    started_at: float


@dataclass
class _Slot:
    camera: str
    url: SecretStr
    out_dir: Path
    run: _Run | None = None
    failures: int = 0
    retry_at: float = 0.0


class Recorder:
    def __init__(
        self,
        cameras: Mapping[str, SecretStr],
        segments_dir: Path,
        conn: sqlite3.Connection,
        ffmpeg: str,
        *,
        desired: Desired,
        launcher: Launcher = popen_launcher,
        wall_clock: Callable[[], datetime] = lambda: datetime.now(UTC),
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._slots = [_Slot(name, cameras[name], segments_dir / name) for name in sorted(cameras)]
        self._conn = conn
        self._ffmpeg = ffmpeg
        self._desired = desired
        self._launch = launcher
        self._wall_clock = wall_clock
        self._clock = clock

    def recording(self) -> frozenset[str]:
        return frozenset(slot.camera for slot in self._slots if slot.run is not None)

    def tick(self) -> None:
        due = self._desired(self._wall_clock())
        now = self._clock()
        for slot in self._slots:
            wanted = slot.camera in due
            self._reap(slot, now, wanted=wanted)
            if wanted and slot.run is None and now >= slot.retry_at:
                self._start(slot, now)
            elif not wanted and slot.run is not None:
                self._stop(slot)
            if slot.run is not None:
                self._ingest(slot, slot.run.list_path)

    def _reap(self, slot: _Slot, now: float, *, wanted: bool) -> None:
        if slot.run is None:
            return
        code = slot.run.process.poll()
        if code is None:
            return
        run, slot.run = slot.run, None
        self._ingest(slot, run.list_path)
        if not wanted:
            slot.failures, slot.retry_at = 0, 0.0
            return
        healthy = now - run.started_at >= HEALTHY_RUN_S
        slot.failures = 1 if healthy else slot.failures + 1
        slot.retry_at = now + backoff_delay(slot.failures)
        logger.warning(
            "recorder_camera_exited",
            extra={
                "camera": slot.camera,
                "exit_code": code,
                "retry_in_s": backoff_delay(slot.failures),
            },
        )

    def _start(self, slot: _Slot, now: float) -> None:
        lists_dir = slot.out_dir / LISTS_DIRNAME
        stamp = self._wall_clock().strftime("%Y%m%dT%H%M%S%fZ")
        list_path = lists_dir / f"{slot.camera}-{stamp}.csv"
        command = record_command(
            self._ffmpeg, slot.url.get_secret_value(), slot.camera, slot.out_dir, list_path
        )
        try:
            lists_dir.mkdir(parents=True, exist_ok=True)
            process = self._launch(command, slot.camera)
        except OSError as error:
            slot.failures += 1
            slot.retry_at = now + backoff_delay(slot.failures)
            logger.error(
                "recorder_camera_launch_failed",
                extra={"camera": slot.camera, "error": redact_credentials(str(error))},
            )
            return
        slot.run = _Run(process, list_path, now)
        logger.info("recorder_camera_started", extra={"camera": slot.camera})

    def _stop(self, slot: _Slot) -> None:
        if slot.run is None:
            return
        _terminate(slot.run.process)
        self._ingest(slot, slot.run.list_path)
        slot.run = None
        slot.failures, slot.retry_at = 0, 0.0
        logger.info("recorder_camera_stopped", extra={"camera": slot.camera})

    def _ingest(self, slot: _Slot, list_path: Path) -> None:
        """Save every segment FFmpeg has closed. Saving twice is a no-op."""
        try:
            listed = parse_segment_list(list_path.read_text(encoding="utf-8", errors="replace"))
        except FileNotFoundError:
            return
        for item in listed:
            parsed = parse_segment_name(item.filename)
            path = slot.out_dir / item.filename
            if parsed is None or parsed[0] != slot.camera:
                logger.warning(
                    "recorder_unexpected_segment",
                    extra={"camera": slot.camera, "file": item.filename},
                )
                continue
            try:
                size = path.stat().st_size
            except FileNotFoundError:
                logger.warning(
                    "recorder_segment_missing",
                    extra={"camera": slot.camera, "file": item.filename},
                )
                continue
            saved = record_segment(
                self._conn,
                camera=slot.camera,
                path=path,
                started_at=parsed[1],
                duration_s=item.duration_s,
                size_bytes=size,
            )
            if saved:
                logger.debug(
                    "recorder_segment_saved",
                    extra={"camera": slot.camera, "file": item.filename},
                )

    def shutdown(self) -> None:
        for slot in self._slots:
            self._stop(slot)

    def run(
        self,
        stop: threading.Event,
        interval: float = TICK_INTERVAL_S,
        until: Callable[[], bool] = lambda: False,
    ) -> None:
        """Tick until ``stop`` is set or ``until()`` is true, then stop every camera."""
        try:
            while not stop.is_set() and not until():
                self.tick()
                stop.wait(interval)
        finally:
            self.shutdown()


def _terminate(process: Process) -> None:
    """SIGTERM lets FFmpeg close the current segment and list it."""
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=TERMINATE_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
