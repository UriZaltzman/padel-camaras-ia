from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest

from ml.bench import (
    Frame,
    Stage,
    render_markdown,
    run_benchmark,
    run_camera,
    synthetic_frames,
    write_reports,
)
from ml.bench.__main__ import main
from ml.bench.device import DeviceInfo
from ml.thresholds import load_thresholds

DEVICE = DeviceInfo(
    hostname="club-box",
    os="Linux",
    python="3.12",
    cpu="x86_64",
    cpu_count=8,
    gpus=["NVIDIA GeForce RTX 4060, 550.0, 8188 MiB"],
)


class FakeClock:
    """Each stage call advances time by that stage's fixed cost."""

    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def costly(clock: FakeClock, name: str, cost_s: float) -> Stage:
    def run(_frame: Frame) -> None:
        clock.now += cost_s

    return Stage(name, run)


def frames(count: int, fps: int = 25) -> Iterator[Frame]:
    return synthetic_frames(duration_s=count / fps, fps=fps, width_px=4, height_px=2, channels=3)


def test_synthetic_frames_count_and_timestamps() -> None:
    out = list(frames(50))
    assert len(out) == 50
    assert out[25].timestamp_s == 1.0
    assert len(out[0].pixels) == 24


def test_timing_math_with_fake_clock() -> None:
    clock = FakeClock()
    stages = [costly(clock, "players", 0.004), costly(clock, "ball", 0.002)]
    result = run_camera(
        "cam-1", frames(100), stages, fps=25, target_realtime_factor=6.0, clock=clock
    )
    # 100 frames at 25 fps = 4 s of video; 100 * 6 ms = 0.6 s of work.
    assert result.video_s == pytest.approx(4.0)
    assert result.wall_s == pytest.approx(0.6)
    assert result.realtime_factor == pytest.approx(4.0 / 0.6)
    assert result.frames_per_s == pytest.approx(100 / 0.6)
    assert result.meets_target
    players, ball = result.stages
    assert players.total_s == pytest.approx(0.4)
    assert players.mean_s_per_frame == pytest.approx(0.004)
    assert players.share_of_wall == pytest.approx(2 / 3)
    assert ball.share_of_wall == pytest.approx(1 / 3)


@pytest.mark.parametrize(("cost_s", "passes"), [(0.0066, True), (0.0067, False)])
def test_pass_fail_against_target(cost_s: float, passes: bool) -> None:
    # One frame lasts 40 ms at 25 fps, so 6x needs at most 6.67 ms per frame.
    clock = FakeClock()
    report = run_benchmark(
        {"cam-1": lambda: frames(25), "cam-2": lambda: frames(25)},
        [costly(clock, "all", cost_s)],
        fps=25,
        target_realtime_factor=6.0,
        clock=clock,
        device=DEVICE,
    )
    assert report.passed is passes
    assert all(c.meets_target is passes for c in report.cameras)


def test_empty_source_fails() -> None:
    result = run_camera("cam-1", iter([]), [], fps=25, target_realtime_factor=6.0)
    assert result.frames == 0
    assert not result.meets_target


def test_reports_are_written(tmp_path: Path) -> None:
    clock = FakeClock()
    report = run_benchmark(
        {"cam-1": lambda: frames(25)},
        [costly(clock, "players", 0.01)],
        fps=25,
        target_realtime_factor=6.0,
        clock=clock,
        device=DEVICE,
    )
    json_path, md_path = write_reports(report, tmp_path)
    data = json.loads(json_path.read_text())
    assert data["passed"] is False
    assert data["worst_realtime_factor"] == pytest.approx(4.0)
    assert data["device"]["gpus"] == DEVICE.gpus
    assert data["cameras"][0]["stages"][0]["name"] == "players"
    md = md_path.read_text()
    assert md == render_markdown(report)
    assert "Result: **FAIL**" in md
    assert "| cam-1 | 25 | 1.00 | 0.2500 | 100.0 | 4.00 | FAIL |" in md
    assert "RTX 4060" in md


def test_target_lives_in_thresholds() -> None:
    perf = load_thresholds().performance
    assert perf.min_realtime_factor == 6.0
    assert perf.analysis_fps == 25


def test_cli_runs_with_dummy_stages(tmp_path: Path) -> None:
    code = main(["--cameras", "2", "--out", str(tmp_path)])
    data = json.loads((tmp_path / "bench.json").read_text())
    assert [c["camera_id"] for c in data["cameras"]] == ["cam-1", "cam-2"]
    assert code == (0 if data["passed"] else 1)
