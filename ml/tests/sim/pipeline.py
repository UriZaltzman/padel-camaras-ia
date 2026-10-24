"""Run the geometry pipeline on a simulated rally and keep everything needed to score it."""

from __future__ import annotations

import dataclasses
import random
from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

from ml.ball.records import BallDetection, TrackPoint
from ml.ball.track import SmoothedTrack, smooth_track
from ml.ball.triangulate import (
    GeometryContext,
    SyncEstimate,
    estimate_offset,
    single_camera_observations,
    triangulate_ball,
)
from ml.geometry.calibration import (
    CalibrationRejectedError,
    CourtCalibration,
    calibrate,
)
from ml.schemas import BallObservation, Camera
from ml.thresholds import Thresholds
from sim.camera import (
    PROFILES,
    NoiseProfile,
    RawDetection,
    VirtualCamera,
    detections,
    estimated_intrinsics,
    make_camera,
    marked_points,
)
from sim.rally import Rally

F64 = NDArray[np.float64]
MAX_CALIBRATION_ATTEMPTS = 30
REMEASURE_LENS_EVERY = 4


@dataclass
class CameraRun:
    cams: dict[str, VirtualCamera]
    cals: dict[str, CourtCalibration]
    attempts: dict[str, int]
    raw: dict[str, list[RawDetection]]
    truth_px: dict[str, dict[int, tuple[float, float]]]
    silent: dict[str, set[int]]
    smoothed: dict[str, SmoothedTrack]
    sync: SyncEstimate | None
    true_offset_ms: float
    observations: list[BallObservation]
    fps: float
    extras: dict[str, float] = field(default_factory=dict)


def calibrate_camera(
    cam: VirtualCamera, th: Thresholds, rng: random.Random, noise: NoiseProfile
) -> tuple[CourtCalibration, int]:
    """Mark the 12 points and calibrate; when rejected the installer clicks again."""
    intrinsics = estimated_intrinsics(rng, noise)
    for attempt in range(1, MAX_CALIBRATION_ATTEMPTS + 1):
        if attempt % REMEASURE_LENS_EVERY == 0:
            intrinsics = estimated_intrinsics(rng, noise)  # the chessboard is shot again
        marks = marked_points(cam, th.court, rng, noise)
        try:
            return calibrate(marks, intrinsics, th.court, th.calibration), attempt
        except CalibrationRejectedError:
            continue
    msg = "calibration rejected too many times"
    raise RuntimeError(msg)


def to_records(camera: Camera, raw: list[RawDetection]) -> list[BallDetection]:
    return [
        BallDetection(
            camera=camera,
            frame=d.frame,
            time_ms=d.time_ms,
            confidence=d.confidence,
            x_px=d.x_px,
            y_px=d.y_px,
        )
        for d in raw
    ]


def run_cameras(
    rally: Rally,
    th: Thresholds,
    noise: NoiseProfile,
    seed: int,
    fps: float = 60.0,
    cameras: str = "AB",
) -> CameraRun:
    rng = random.Random(seed)
    cams = {n: make_camera(n, th.court) for n in "AB"}
    cals: dict[str, CourtCalibration] = {}
    attempts: dict[str, int] = {}
    for n in "AB":
        cals[n], attempts[n] = calibrate_camera(cams[n], th, rng, noise)
    offsets = {"A": 0.0, "B": noise.clock_offset_ms / 1000.0}
    raw: dict[str, list[RawDetection]] = {}
    truth: dict[str, dict[int, tuple[float, float]]] = {}
    silent: dict[str, set[int]] = {}
    smoothed: dict[str, SmoothedTrack] = {}
    for n in cameras:
        raw[n], truth[n], silent[n] = detections(cams[n], rally, fps, offsets[n], rng, noise)
        smoothed[n] = smooth_track(
            to_records(Camera(n), raw[n]), cals[n].intrinsics, th.ball, th.ball_track
        )
    empty: list[TrackPoint] = []
    track_a = list(smoothed["A"].points) if "A" in smoothed else empty
    track_b = list(smoothed["B"].points) if "B" in smoothed else empty
    sync = None
    if track_a and track_b:
        sync = estimate_offset(cals["A"], cals["B"], track_a, track_b, th.triangulation)
    offset = sync.offset_ms if sync is not None else 0.0
    if track_a and track_b:
        obs = triangulate_ball(
            cals["A"],
            cals["B"],
            track_a,
            track_b,
            offset_ms=offset,
            context=GeometryContext.from_thresholds(th),
        )
    elif track_a or track_b:
        only = "A" if track_a else "B"
        obs = single_camera_observations(
            cals[only], track_a or track_b, GeometryContext.from_thresholds(th)
        )
    else:
        obs = []
    return CameraRun(
        cams, cals, attempts, raw, truth, silent, smoothed, sync, noise.clock_offset_ms, obs, fps
    )


def perfect_calibration(cam: VirtualCamera, th: Thresholds) -> CourtCalibration:
    """Calibration from exact clicks and the true lens: for tests that isolate one stage."""
    exact = dataclasses.replace(PROFILES["low"], mark_px=0.0, focal_error=0.0, distortion_error=0.0)
    return calibrate_camera(cam, th, random.Random(0), exact)[0]
