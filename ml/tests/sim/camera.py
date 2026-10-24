"""Virtual pinhole cameras behind each back glass, and what they would report."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

import cv2
import numpy as np
from numpy.typing import NDArray

from ml.geometry.calibration import CameraIntrinsics
from ml.geometry.court import reference_points
from ml.thresholds import CourtGeometry
from sim.rally import Rally

F64 = NDArray[np.float64]
WIDTH_PX = 1920
HEIGHT_PX = 1080
FOCAL_PX = 800.0
CAM_HEIGHT_M = 6.0
CAM_BEHIND_GLASS_M = 3.0
CAM_PITCH_DEG = 35.0


@dataclass(frozen=True)
class NoiseProfile:
    """Everything that degrades what the cameras deliver, at one noise level."""

    name: str
    mark_px: float  # installer clicking error on the 12 calibration points
    ball_px: float  # detector centre error
    dropout: float  # probability that a frame has no detection
    burst_start: float  # probability that a dropout burst starts at a frame
    burst_mean_frames: float
    false_positive: float  # probability of a spurious detection in a frame
    wrist_m: float  # error of the wrist position handed to the shot detector
    focal_error: float  # relative error of the chessboard focal length
    distortion_error: float  # absolute error of the k1 coefficient
    clock_offset_ms: float  # true offset of camera B against camera A


PROFILES = {
    "low": NoiseProfile("low", 0.4, 0.5, 0.05, 0.01, 4.0, 0.002, 0.05, 0.002, 0.005, 17.0),
    "medium": NoiseProfile("medium", 0.7, 1.0, 0.12, 0.02, 5.0, 0.005, 0.10, 0.005, 0.01, -23.0),
    "high": NoiseProfile("high", 1.0, 2.0, 0.25, 0.04, 6.0, 0.01, 0.15, 0.01, 0.02, 31.0),
    "extreme": NoiseProfile("extreme", 1.0, 3.0, 0.40, 0.06, 7.0, 0.02, 0.25, 0.01, 0.02, -37.0),
}


@dataclass(frozen=True, eq=False)
class VirtualCamera:
    name: str
    position: F64
    rotation: F64  # world -> camera
    translation: F64
    true_intrinsics: CameraIntrinsics

    def project(self, points: F64, intrinsics: CameraIntrinsics | None = None) -> F64:
        intr = intrinsics or self.true_intrinsics
        rvec, _ = cv2.Rodrigues(self.rotation)
        out, _ = cv2.projectPoints(
            np.asarray(points, dtype=np.float64).reshape(-1, 3),
            rvec,
            self.translation,
            intr.matrix,
            intr.distortion,
        )
        return np.asarray(out, dtype=np.float64).reshape(-1, 2)

    def depth(self, points: F64) -> F64:
        cam = (self.rotation @ np.asarray(points, dtype=np.float64).T).T + self.translation
        return np.asarray(cam[:, 2], dtype=np.float64)

    def visible(self, points: F64, margin_px: float = 0.0) -> tuple[F64, F64]:
        """Pixels and a boolean mask of the points that fall inside the image."""
        px = self.project(points)
        inside = (
            (self.depth(points) > 0.5)
            & (px[:, 0] >= margin_px)
            & (px[:, 0] < WIDTH_PX - margin_px)
            & (px[:, 1] >= margin_px)
            & (px[:, 1] < HEIGHT_PX - margin_px)
        )
        return px, inside.astype(np.float64)


def true_intrinsics() -> CameraIntrinsics:
    matrix = np.array(
        [[FOCAL_PX, 0.0, WIDTH_PX / 2.0], [0.0, FOCAL_PX, HEIGHT_PX / 2.0], [0.0, 0.0, 1.0]]
    )
    return CameraIntrinsics(matrix=matrix, distortion=np.array([-0.12, 0.03, 0.0, 0.0, 0.0]))


def make_camera(name: str, court: CourtGeometry) -> VirtualCamera:
    """Camera A behind the y = 0 glass looking along +y; camera B mirrored."""
    sign = 1.0 if name == "A" else -1.0
    y = -CAM_BEHIND_GLASS_M if name == "A" else court.length_m + CAM_BEHIND_GLASS_M
    position = np.array([court.width_m / 2.0, y, CAM_HEIGHT_M])
    pitch = math.radians(CAM_PITCH_DEG)
    forward = np.array([0.0, sign * math.cos(pitch), -math.sin(pitch)])
    right = np.array([sign, 0.0, 0.0])
    down = np.cross(forward, right)
    rotation = np.stack([right, down, forward])
    translation = -rotation @ position
    return VirtualCamera(name, position, rotation, translation, true_intrinsics())


def estimated_intrinsics(rng: random.Random, noise: NoiseProfile) -> CameraIntrinsics:
    """What the chessboard calibration gives: close to the truth but not exact."""
    true = true_intrinsics()
    scale = 1.0 + rng.gauss(0.0, noise.focal_error)
    matrix = true.matrix.copy()
    matrix[0, 0] *= scale
    matrix[1, 1] *= scale
    dist = true.distortion.copy()
    dist[0] += rng.gauss(0.0, noise.distortion_error)
    return CameraIntrinsics(matrix=matrix, distortion=dist)


def marked_points(
    cam: VirtualCamera, court: CourtGeometry, rng: random.Random, noise: NoiseProfile
) -> F64:
    """The 12 points as the installer would click them: truth plus clicking error."""
    ref = reference_points(court)
    px = cam.project(np.column_stack([ref, np.zeros(len(ref))]))
    jitter = np.array([[rng.gauss(0.0, noise.mark_px) for _ in range(2)] for _ in px])
    return np.asarray(px + jitter, dtype=np.float64)


@dataclass(frozen=True)
class RawDetection:
    """One detector output: what stage 5 hands to the track smoother."""

    frame: int
    time_ms: int
    confidence: float
    x_px: float
    y_px: float
    truth_xy: tuple[float, float] | None  # None for spurious detections


def detections(
    cam: VirtualCamera,
    rally: Rally,
    fps: float,
    clock_offset_s: float,
    rng: random.Random,
    noise: NoiseProfile,
) -> tuple[list[RawDetection], dict[int, tuple[float, float]], set[int]]:
    """Per-frame ball detections with noise, dropouts and false positives.

    Returns the detections, the true pixel of every frame where the ball is in view (for
    scoring the gap fill) and the frames where the detector was silent although it was visible.
    The frame timestamps are nominal (``frame / fps``); the pixels were taken
    ``clock_offset_s`` later in real time.
    """
    n_frames = int(rally.duration_s * fps)
    nominal = np.arange(n_frames) / fps
    true_t = np.clip(nominal + clock_offset_s, 0.0, rally.duration_s)
    ball = rally.ball_at(true_t)
    px, inside = cam.visible(ball, margin_px=4.0)
    out: list[RawDetection] = []
    truth: dict[int, tuple[float, float]] = {}
    silent: set[int] = set()
    burst_left = 0
    for k in range(n_frames):
        if burst_left == 0 and rng.random() < noise.burst_start:
            burst_left = max(1, int(rng.expovariate(1.0 / noise.burst_mean_frames)))
        dropped = burst_left > 0 or rng.random() < noise.dropout
        if burst_left > 0:
            burst_left -= 1
        visible = bool(inside[k]) and true_t[k] >= rally.hits[0].time_s
        if visible:
            truth[k] = (float(px[k, 0]), float(px[k, 1]))
        t_ms = round(nominal[k] * 1000.0)
        if visible and not dropped:
            out.append(
                RawDetection(
                    k,
                    t_ms,
                    rng.uniform(0.6, 1.0),
                    float(px[k, 0]) + rng.gauss(0.0, noise.ball_px),
                    float(px[k, 1]) + rng.gauss(0.0, noise.ball_px),
                    (float(px[k, 0]), float(px[k, 1])),
                )
            )
        elif visible:
            silent.add(k)
        if rng.random() < noise.false_positive:
            out.append(
                RawDetection(
                    k,
                    t_ms,
                    rng.uniform(0.5, 0.8),
                    rng.uniform(0.0, WIDTH_PX),
                    rng.uniform(0.0, HEIGHT_PX),
                    None,
                )
            )
    return out, truth, silent
