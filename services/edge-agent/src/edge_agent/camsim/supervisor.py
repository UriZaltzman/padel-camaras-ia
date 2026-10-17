"""Keeps one FFmpeg publisher per camera in the state the CLI asked for.

Every tick it reads the state file, starts the cameras that should run (with
exponential backoff when FFmpeg keeps dying, e.g. while the RTSP server boots) and
stops the ones marked as stopped. A stopped camera disappears from the RTSP server,
exactly like a real camera that loses power.
"""

import logging
import subprocess
import threading
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Protocol

from edge_agent.camsim.cameras import Camera
from edge_agent.camsim.state import StateFileError, read_stopped

BACKOFF_INITIAL_S: Final = 1.0
BACKOFF_MAX_S: Final = 10.0
HEALTHY_RUN_S: Final = 30.0
TERMINATE_TIMEOUT_S: Final = 5.0
TICK_INTERVAL_S: Final = 0.5

logger = logging.getLogger("edge_agent.camsim")


class Process(Protocol):
    def poll(self) -> int | None: ...
    def terminate(self) -> None: ...
    def kill(self) -> None: ...
    def wait(self, timeout: float | None = None) -> int: ...


Launcher = Callable[[Sequence[str]], Process]
Clock = Callable[[], float]


def popen_launcher(command: Sequence[str]) -> Process:
    return subprocess.Popen(command, stdin=subprocess.DEVNULL)  # noqa: S603 - no shell


def backoff_delay(failures: int) -> float:
    """Seconds to wait before restarting after ``failures`` quick exits in a row."""
    if failures <= 0:
        return 0.0
    return float(min(BACKOFF_INITIAL_S * 2 ** (failures - 1), BACKOFF_MAX_S))


@dataclass
class _Slot:
    camera: Camera
    command: Sequence[str]
    process: Process | None = None
    started_at: float = 0.0
    failures: int = 0
    retry_at: float = 0.0


class Supervisor:
    def __init__(
        self,
        commands: Mapping[Camera, Sequence[str]],
        state_path: Path,
        launcher: Launcher = popen_launcher,
        clock: Clock = time.monotonic,
    ) -> None:
        self._slots = [_Slot(camera, commands[camera]) for camera in sorted(commands)]
        self._state_path = state_path
        self._launch = launcher
        self._clock = clock
        self._stopped: frozenset[Camera] = frozenset()

    def running(self) -> frozenset[Camera]:
        return frozenset(slot.camera for slot in self._slots if _alive(slot.process))

    def _read_desired(self) -> frozenset[Camera]:
        try:
            self._stopped = read_stopped(self._state_path)
        except StateFileError:
            # Keep the last good state rather than flapping every camera.
            logger.exception("camsim_state_unreadable")
        return self._stopped

    def tick(self) -> None:
        stopped = self._read_desired()
        now = self._clock()
        for slot in self._slots:
            wanted = slot.camera not in stopped
            self._reap(slot, now, wanted=wanted)
            if wanted and slot.process is None and now >= slot.retry_at:
                self._start(slot, now)
            elif not wanted and slot.process is not None:
                self._stop(slot)

    def _reap(self, slot: _Slot, now: float, *, wanted: bool) -> None:
        if slot.process is None:
            return
        code = slot.process.poll()
        if code is None:
            return
        slot.process = None
        if not wanted:
            slot.failures, slot.retry_at = 0, 0.0
            return
        healthy = now - slot.started_at >= HEALTHY_RUN_S
        slot.failures = 1 if healthy else slot.failures + 1
        slot.retry_at = now + backoff_delay(slot.failures)
        logger.warning(
            "camsim_camera_exited",
            extra={
                "camera": slot.camera.name,
                "exit_code": code,
                "retry_in_s": backoff_delay(slot.failures),
            },
        )

    def _start(self, slot: _Slot, now: float) -> None:
        try:
            slot.process = self._launch(slot.command)
        except OSError:
            slot.failures += 1
            slot.retry_at = now + backoff_delay(slot.failures)
            logger.exception("camsim_camera_launch_failed", extra={"camera": slot.camera.name})
            return
        slot.started_at = now
        logger.info("camsim_camera_started", extra={"camera": slot.camera.name})

    def _stop(self, slot: _Slot) -> None:
        if slot.process is not None:
            _terminate(slot.process)
        slot.process = None
        slot.failures = 0
        slot.retry_at = 0.0
        logger.info("camsim_camera_stopped", extra={"camera": slot.camera.name})

    def shutdown(self) -> None:
        for slot in self._slots:
            if slot.process is not None:
                _terminate(slot.process)
                slot.process = None

    def run(self, stop: threading.Event, interval: float = TICK_INTERVAL_S) -> None:
        """Tick until ``stop`` is set, then stop every camera."""
        try:
            while not stop.is_set():
                self.tick()
                stop.wait(interval)
        finally:
            self.shutdown()


def _alive(process: Process | None) -> bool:
    return process is not None and process.poll() is None


def _terminate(process: Process) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=TERMINATE_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
