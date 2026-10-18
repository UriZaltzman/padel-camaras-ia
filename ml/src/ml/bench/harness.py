"""Timing core of the benchmark. The clock is injectable so the math is testable."""

from __future__ import annotations

import time
from collections.abc import Callable, Iterable, Iterator, Sequence
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict

from ml.bench.device import DeviceInfo

Clock = Callable[[], float]


@dataclass(frozen=True, slots=True)
class Frame:
    """One decoded video frame. ``pixels`` is raw interleaved bytes (H x W x C)."""

    index: int
    timestamp_s: float
    width_px: int
    height_px: int
    pixels: bytes


@dataclass(frozen=True, slots=True)
class Stage:
    """A named pipeline step. ``run`` receives each frame; its output is ignored here."""

    name: str
    run: Callable[[Frame], object]


class _Model(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class StageTiming(_Model):
    name: str
    total_s: float
    mean_s_per_frame: float
    share_of_wall: float


class CameraResult(_Model):
    camera_id: str
    frames: int
    video_s: float
    wall_s: float
    frames_per_s: float
    realtime_factor: float
    """Seconds of video processed per wall-clock second ("x real time")."""
    meets_target: bool
    stages: list[StageTiming]


class BenchReport(_Model):
    target_realtime_factor: float
    analysis_fps: int
    device: DeviceInfo
    cameras: list[CameraResult]

    @property
    def passed(self) -> bool:
        return bool(self.cameras) and all(c.meets_target for c in self.cameras)

    @property
    def worst_realtime_factor(self) -> float:
        return min((c.realtime_factor for c in self.cameras), default=0.0)


def synthetic_frames(
    *, duration_s: float, fps: int, width_px: int, height_px: int, channels: int
) -> Iterator[Frame]:
    """Deterministic black frames, for running the harness without a video or a camera."""
    count = round(duration_s * fps)
    pixels = bytes(width_px * height_px * channels)
    for index in range(count):
        yield Frame(
            index=index,
            timestamp_s=index / fps,
            width_px=width_px,
            height_px=height_px,
            pixels=pixels,
        )


def _ratio(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator > 0 else 0.0


def run_camera(
    camera_id: str,
    frames: Iterable[Frame],
    stages: Sequence[Stage],
    *,
    fps: int,
    target_realtime_factor: float,
    clock: Clock = time.perf_counter,
) -> CameraResult:
    """Run every stage on every frame and time it. Frame decoding is not counted."""
    totals = dict.fromkeys((s.name for s in stages), 0.0)
    count = 0
    for frame in frames:
        for stage in stages:
            start = clock()
            stage.run(frame)
            totals[stage.name] += clock() - start
        count += 1
    wall_s = sum(totals.values())
    video_s = count / fps
    factor = _ratio(video_s, wall_s)
    return CameraResult(
        camera_id=camera_id,
        frames=count,
        video_s=video_s,
        wall_s=wall_s,
        frames_per_s=_ratio(count, wall_s),
        realtime_factor=factor,
        meets_target=count > 0 and factor >= target_realtime_factor,
        stages=[
            StageTiming(
                name=name,
                total_s=total,
                mean_s_per_frame=total / count if count else 0.0,
                share_of_wall=total / wall_s if wall_s > 0 else 0.0,
            )
            for name, total in totals.items()
        ],
    )


def run_benchmark(
    cameras: dict[str, Callable[[], Iterable[Frame]]],
    stages: Sequence[Stage],
    *,
    fps: int,
    target_realtime_factor: float,
    clock: Clock = time.perf_counter,
    device: DeviceInfo,
) -> BenchReport:
    """Benchmark each camera in turn. ``cameras`` maps an id to a frame source factory."""
    results = [
        run_camera(
            camera_id,
            source(),
            stages,
            fps=fps,
            target_realtime_factor=target_realtime_factor,
            clock=clock,
        )
        for camera_id, source in cameras.items()
    ]
    return BenchReport(
        target_realtime_factor=target_realtime_factor,
        analysis_fps=fps,
        device=device,
        cameras=results,
    )
