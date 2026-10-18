"""Pipeline speed benchmark: how many times faster than real time each camera is analysed.

Spec section 4 (Dimensionamiento) asks for at least ``performance.min_realtime_factor`` (6x)
per camera on an RTX 4060 class GPU. Stages are plain callables, so the real models of phase 2
drop in without touching the harness; dummy stages ship for now.
"""

from ml.bench.harness import (
    BenchReport,
    CameraResult,
    Frame,
    Stage,
    StageTiming,
    run_benchmark,
    run_camera,
    synthetic_frames,
)
from ml.bench.report import render_markdown, write_reports

__all__ = [
    "BenchReport",
    "CameraResult",
    "Frame",
    "Stage",
    "StageTiming",
    "render_markdown",
    "run_benchmark",
    "run_camera",
    "synthetic_frames",
    "write_reports",
]
