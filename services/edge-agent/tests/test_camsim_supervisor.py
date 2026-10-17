import subprocess
import threading
from collections.abc import Sequence
from pathlib import Path

import pytest

from edge_agent.camsim.cameras import Camera, cameras_for
from edge_agent.camsim.state import set_running
from edge_agent.camsim.supervisor import (
    BACKOFF_MAX_S,
    HEALTHY_RUN_S,
    Process,
    Supervisor,
    backoff_delay,
)

A, B = Camera(1, "a"), Camera(1, "b")


class FakeProcess:
    def __init__(self, command: Sequence[str], *, ignores_terminate: bool = False) -> None:
        self.command = list(command)
        self.code: int | None = None
        self.terminated = False
        self.killed = False
        self.ignores_terminate = ignores_terminate

    def poll(self) -> int | None:
        return self.code

    def terminate(self) -> None:
        self.terminated = True
        if not self.ignores_terminate:
            self.code = -15

    def kill(self) -> None:
        self.killed = True
        self.code = -9

    def wait(self, timeout: float | None = None) -> int:
        if self.code is None:
            raise subprocess.TimeoutExpired(self.command, timeout or 0)
        return self.code


class FakeLauncher:
    def __init__(self) -> None:
        self.launched: list[FakeProcess] = []
        self.fail_next = False
        self.ignores_terminate = False

    def __call__(self, command: Sequence[str]) -> Process:
        if self.fail_next:
            self.fail_next = False
            raise FileNotFoundError(command[0])
        process = FakeProcess(command, ignores_terminate=self.ignores_terminate)
        self.launched.append(process)
        return process

    def for_camera(self, camera: Camera) -> list[FakeProcess]:
        return [p for p in self.launched if p.command[-1] == camera.name]


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def state_path(tmp_path: Path) -> Path:
    return tmp_path / "cameras.json"


@pytest.fixture
def launcher() -> FakeLauncher:
    return FakeLauncher()


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


def make(state_path: Path, launcher: FakeLauncher, clock: FakeClock, courts: int = 1) -> Supervisor:
    commands = {camera: ["ffmpeg", camera.name] for camera in cameras_for(courts)}
    return Supervisor(commands, state_path, launcher=launcher, clock=clock)


def test_backoff_doubles_and_is_capped() -> None:
    assert [backoff_delay(n) for n in range(6)] == [0.0, 1.0, 2.0, 4.0, 8.0, BACKOFF_MAX_S]
    assert backoff_delay(50) == BACKOFF_MAX_S


def test_starts_every_camera(state_path: Path, launcher: FakeLauncher, clock: FakeClock) -> None:
    supervisor = make(state_path, launcher, clock, courts=2)

    supervisor.tick()

    assert len(launcher.launched) == 4
    assert supervisor.running() == set(cameras_for(2))
    supervisor.tick()
    assert len(launcher.launched) == 4


def test_stop_and_start_from_state_file(
    state_path: Path, launcher: FakeLauncher, clock: FakeClock
) -> None:
    supervisor = make(state_path, launcher, clock)
    supervisor.tick()
    first = launcher.for_camera(A)[0]

    set_running(state_path, A, running=False)
    supervisor.tick()
    assert first.terminated
    assert supervisor.running() == {B}

    set_running(state_path, A, running=True)
    supervisor.tick()
    assert supervisor.running() == {A, B}
    assert len(launcher.for_camera(A)) == 2


def test_camera_stopped_before_start_never_launches(
    state_path: Path, launcher: FakeLauncher, clock: FakeClock
) -> None:
    set_running(state_path, B, running=False)
    supervisor = make(state_path, launcher, clock)

    supervisor.tick()

    assert launcher.for_camera(B) == []
    assert supervisor.running() == {A}


def test_crashing_camera_restarts_with_backoff(
    state_path: Path, launcher: FakeLauncher, clock: FakeClock
) -> None:
    supervisor = make(state_path, launcher, clock)
    supervisor.tick()

    launcher.for_camera(A)[-1].code = 1  # RTSP server not ready yet
    supervisor.tick()
    assert len(launcher.for_camera(A)) == 1  # waits 1 s

    clock.now += 1.0
    supervisor.tick()
    assert len(launcher.for_camera(A)) == 2

    launcher.for_camera(A)[-1].code = 1
    supervisor.tick()
    clock.now += 1.0
    supervisor.tick()
    assert len(launcher.for_camera(A)) == 2  # second quick failure waits 2 s
    clock.now += 1.0
    supervisor.tick()
    assert len(launcher.for_camera(A)) == 3


def test_failure_after_healthy_run_resets_backoff(
    state_path: Path, launcher: FakeLauncher, clock: FakeClock
) -> None:
    supervisor = make(state_path, launcher, clock)
    supervisor.tick()
    for _ in range(3):
        launcher.for_camera(A)[-1].code = 1
        supervisor.tick()
        clock.now += BACKOFF_MAX_S
        supervisor.tick()

    clock.now += HEALTHY_RUN_S
    launcher.for_camera(A)[-1].code = 1
    supervisor.tick()
    launched = len(launcher.for_camera(A))
    clock.now += 1.0
    supervisor.tick()
    assert len(launcher.for_camera(A)) == launched + 1


def test_launch_error_is_retried(
    state_path: Path, launcher: FakeLauncher, clock: FakeClock
) -> None:
    supervisor = make(state_path, launcher, clock)
    launcher.fail_next = True

    supervisor.tick()
    assert supervisor.running() == {B}

    clock.now += 1.0
    supervisor.tick()
    assert supervisor.running() == {A, B}


def test_corrupt_state_file_keeps_last_good_state(
    state_path: Path, launcher: FakeLauncher, clock: FakeClock
) -> None:
    supervisor = make(state_path, launcher, clock)
    set_running(state_path, A, running=False)
    supervisor.tick()

    state_path.write_text("garbage")
    supervisor.tick()

    assert supervisor.running() == {B}


def test_process_that_ignores_terminate_is_killed(
    state_path: Path, launcher: FakeLauncher, clock: FakeClock
) -> None:
    launcher.ignores_terminate = True
    supervisor = make(state_path, launcher, clock)
    supervisor.tick()

    set_running(state_path, A, running=False)
    supervisor.tick()

    process = launcher.for_camera(A)[0]
    assert process.terminated
    assert process.killed


def test_run_stops_every_camera_on_exit(
    state_path: Path, launcher: FakeLauncher, clock: FakeClock
) -> None:
    supervisor = make(state_path, launcher, clock)
    stop = threading.Event()
    stop.set()
    supervisor.tick()

    supervisor.run(stop, interval=0)

    assert supervisor.running() == frozenset()
    assert all(p.terminated for p in launcher.launched)
