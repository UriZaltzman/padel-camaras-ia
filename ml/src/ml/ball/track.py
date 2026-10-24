"""Stage 5, post-processing half (issue #124): smooth the ball track of one camera.

Input: the detector's peaks per frame (several candidates may share a frame, and some are
false). Output: one position per frame, measured or filled in.

* Constant-acceleration Kalman filter on the undistorted pixel position (x and y share the
  same covariance because both axes have the same model and the same noise).
* Mahalanobis gate: a detection that cannot be reached from the prediction is an impossible
  jump and is dropped; after ``reset_after_rejections`` in a row the track restarts there.
* Gaps of up to ``kalman_max_gap_frames`` frames are filled; a longer gap ends the segment.
* A Rauch-Tung-Striebel pass runs backwards over each segment, so filled frames use the
  detections on both sides and corners (hits, bounces) are not delayed.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

from ml.ball.records import BallDetection, TrackPoint
from ml.geometry.calibration import CameraIntrinsics, undistort_pixels
from ml.geometry.consts import HALF, MS_PER_S, THREE, TWO
from ml.schemas import Camera
from ml.thresholds import BallThresholds, BallTrackThresholds

F64 = NDArray[np.float64]
Candidate = tuple[BallDetection, F64]


@dataclass(frozen=True)
class SmoothedTrack:
    """Smoothed track plus the detections that were thrown away as impossible jumps."""

    points: tuple[TrackPoint, ...]
    rejected: tuple[BallDetection, ...]


@dataclass
class _Step:
    frame: int
    dt: float
    measured: BallDetection | None
    pred_x: F64
    pred_p: F64
    filt_x: F64
    filt_p: F64


def _transition(dt: float) -> F64:
    return np.array([[1.0, dt, HALF * dt * dt], [0.0, 1.0, dt], [0.0, 0.0, 1.0]])


def _process_noise(dt: float, sigma: float) -> F64:
    g = np.array([HALF * dt * dt, dt, 1.0])
    return np.asarray(sigma * sigma * np.outer(g, g), dtype=np.float64)


@dataclass(frozen=True)
class _Seen:
    """A detection waiting to be confirmed as the start of a track."""

    frame: int
    det: BallDetection
    xy: F64


@dataclass
class _Tracker:
    """Forward pass: builds the segments of filtered steps."""

    ball: BallThresholds
    track: BallTrackThresholds
    seconds: Callable[[int], float]
    segments: list[list[_Step]] = field(default_factory=list)
    rejected: list[BallDetection] = field(default_factory=list)
    steps: list[_Step] = field(default_factory=list)
    pending: list[_Seen] = field(default_factory=list)
    recent_rejected: list[_Seen] = field(default_factory=list)
    x: F64 = field(default_factory=lambda: np.zeros((THREE, TWO)))
    p: F64 = field(default_factory=lambda: np.zeros((THREE, THREE)))
    last_frame: int = -1
    last_accepted: int = -1
    last_xy: F64 = field(default_factory=lambda: np.zeros(TWO))
    streak: int = 0

    @staticmethod
    def _step(frame: int, dt: float, det: BallDetection | None, x: F64, p: F64) -> _Step:
        """A step whose filtered state is its prediction (initial or unmeasured)."""
        return _Step(frame, dt, det, x.copy(), p.copy(), x.copy(), p.copy())

    def _speed(self, frame_a: int, xy_a: F64, frame_b: int, xy_b: F64) -> float:
        """Image speed in px/s implied by two detections."""
        elapsed = abs(self.seconds(frame_b) - self.seconds(frame_a))
        distance = float(np.linalg.norm(xy_b - xy_a))
        return distance / elapsed if elapsed > 0.0 else float("inf")

    def _start(self, seen: _Seen) -> None:
        self.x = np.zeros((THREE, TWO))
        self.x[0] = seen.xy
        self.p = np.diag(
            [
                self.track.measurement_sigma_px**TWO,
                self.track.initial_velocity_sigma_px_s**TWO,
                self.track.initial_acceleration_sigma_px_s2**TWO,
            ]
        )
        self.steps.append(self._step(seen.frame, 0.0, seen.det, self.x, self.p))
        self.last_frame = self.last_accepted = seen.frame
        self.last_xy = seen.xy
        self.streak = 0
        self.recent_rejected.clear()

    def close(self) -> None:
        # Trailing predictions are not supported by any detection: cut them.
        while self.steps and self.steps[-1].measured is None:
            self.steps.pop()
        supported = sum(1 for s in self.steps if s.measured is not None)
        if supported >= self.track.min_segment_points:
            self.segments.append(list(self.steps))
        self.steps.clear()

    def _predict_to(self, frame: int) -> float:
        """Predict frame by frame up to ``frame`` (the frames before it are the filled ones)."""
        dt = 0.0
        for gap_frame in range(self.last_frame + 1, frame + 1):
            dt = self.seconds(gap_frame) - self.seconds(gap_frame - 1)
            f = _transition(dt)
            self.x = f @ self.x
            self.p = f @ self.p @ f.T + _process_noise(dt, self.track.process_accel_sigma_px_s2)
            if gap_frame < frame:
                self.steps.append(self._step(gap_frame, dt, None, self.x, self.p))
        return dt

    def feed(self, frame: int, candidates: list[Candidate]) -> None:
        if self.steps and frame - self.last_accepted - 1 > self.ball.kalman_max_gap_frames:
            self.close()
        now = [_Seen(frame, det, xy) for det, xy in candidates]
        if not self.steps:
            self._try_start(frame, now)
        if self.steps:
            self._filter(frame, candidates)

    def _try_start(self, frame: int, now: list[_Seen]) -> None:
        """Start a track only when two detections close in time agree on the ball's speed."""
        horizon = self.track.start_max_gap_frames
        self.pending = [s for s in self.pending if frame - s.frame <= horizon]
        pairs = [
            (self._speed(old.frame, old.xy, new.frame, new.xy), old, new)
            for old in self.pending
            if old.frame < frame
            for new in now
        ]
        agreeing = [pair for pair in pairs if pair[0] <= self.track.max_speed_px_s]
        if agreeing:
            _, old, _ = min(agreeing, key=lambda pair: pair[0])
            self._start(old)
            self.pending.clear()
        else:
            self.pending.extend(now)

    def _filter(self, frame: int, candidates: list[Candidate]) -> None:
        if frame == self.last_frame:
            return  # the first step of a track is its own frame
        dt = self._predict_to(frame)
        s_var = self.p[0, 0] + self.track.measurement_sigma_px**TWO
        det, xy = min(candidates, key=lambda c: float(np.sum((c[1] - self.x[0]) ** TWO)))
        self.rejected.extend(c[0] for c in candidates if c[0] is not det)
        innovation = xy - self.x[0]
        distance = float(np.sqrt(np.sum(innovation**TWO) / s_var))
        reachable = (
            self._speed(self.last_accepted, self.last_xy, frame, xy) <= self.track.max_speed_px_s
        )
        pred_x, pred_p = self.x.copy(), self.p.copy()
        if distance <= self.track.gate_sigma and reachable:
            gain = self.p[:, 0] / s_var
            self.x = self.x + np.outer(gain, innovation)
            self.p = self.p - np.outer(gain, self.p[0, :])
            self.steps.append(_Step(frame, dt, det, pred_x, pred_p, self.x.copy(), self.p.copy()))
            self.streak = 0
            self.last_accepted = frame
            self.last_xy = xy
            self.recent_rejected.clear()
        else:
            self.rejected.append(det)
            self.steps.append(_Step(frame, dt, None, pred_x, pred_p, self.x.copy(), self.p.copy()))
            self.streak += 1
            self.recent_rejected.extend(_Seen(frame, d, c) for d, c in candidates)
            if self.streak >= self.track.reset_after_rejections:
                for _ in range(self.streak):
                    self.steps.pop()
                self.close()
                self.pending = list(self.recent_rejected)
                self.recent_rejected.clear()
                self.streak = 0
                return
        self.last_frame = frame


def _rts(segment: list[_Step]) -> list[F64]:
    """Backward pass: smoothed state of every step."""
    out = [step.filt_x for step in segment]
    cov = segment[-1].filt_p
    for i in reversed(range(len(segment) - 1)):
        nxt = segment[i + 1]
        f = _transition(nxt.dt)
        gain = segment[i].filt_p @ f.T @ np.linalg.inv(nxt.pred_p)
        out[i] = segment[i].filt_x + gain @ (out[i + 1] - nxt.pred_x)
        cov = segment[i].filt_p + gain @ (cov - nxt.pred_p) @ gain.T
    return out


def _to_points(
    camera: Camera, segment: list[_Step], states: list[F64], to_s: Callable[[int], float]
) -> list[TrackPoint]:
    fallback = min(s.measured.confidence for s in segment if s.measured is not None)
    return [
        TrackPoint(
            camera=camera,
            frame=step.frame,
            time_ms=round(to_s(step.frame) * MS_PER_S),
            confidence=step.measured.confidence if step.measured is not None else fallback,
            x_px=float(state[0, 0]),
            y_px=float(state[0, 1]),
            vx_px_s=float(state[1, 0]),
            vy_px_s=float(state[1, 1]),
            interpolated=step.measured is None,
        )
        for step, state in zip(segment, states, strict=True)
    ]


def smooth_track(
    detections: list[BallDetection],
    intrinsics: CameraIntrinsics,
    ball: BallThresholds,
    track: BallTrackThresholds,
) -> SmoothedTrack:
    """Kalman + RTS smoothing of one camera's detections (all with the same ``camera``)."""
    usable = [d for d in detections if d.confidence >= track.min_confidence]
    if not usable:
        return SmoothedTrack((), ())
    camera = usable[0].camera
    order = np.argsort([d.frame for d in usable], kind="stable")
    frames_all = np.array([usable[i].frame for i in order], dtype=np.float64)
    times_all = np.array([usable[i].time_ms for i in order], dtype=np.float64)

    def seconds(frame: int) -> float:
        return float(np.interp(frame, frames_all, times_all)) / MS_PER_S

    und = undistort_pixels(intrinsics, np.array([[d.x_px, d.y_px] for d in usable]))
    by_frame: dict[int, list[Candidate]] = {}
    for det, xy in zip(usable, und, strict=True):
        by_frame.setdefault(det.frame, []).append((det, xy))

    tracker = _Tracker(ball, track, seconds)
    for frame in sorted(by_frame):
        tracker.feed(frame, by_frame[frame])
    tracker.close()

    points: list[TrackPoint] = []
    for segment in tracker.segments:
        points.extend(_to_points(camera, segment, _rts(segment), seconds))
    points.sort(key=lambda tp: tp.frame)
    return SmoothedTrack(tuple(points), tuple(tracker.rejected))
