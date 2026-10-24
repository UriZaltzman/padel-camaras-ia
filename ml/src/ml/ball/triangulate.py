"""Two-camera time alignment and 3D triangulation of the ball (issue #125, spec section 5).

The cameras are NTP-synchronised, but a few tens of milliseconds of offset are enough to put
the ball metres off at 20 m/s. The fine offset is found by sliding camera B's track in time
until the two viewing rays of the ball actually meet. Then every frame is triangulated (closest
point between the two rays) when both cameras saw the ball with confidence and the rays are
consistent; otherwise the frame falls back to the floor position of the camera that saw it.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from ml.ball.records import TrackPoint
from ml.geometry.calibration import CourtCalibration, undistorted_rays, undistorted_to_court
from ml.geometry.consts import HALF, MS_PER_S, THREE, TWO
from ml.schemas import BallObservation, BallPosition
from ml.thresholds import CalibrationThresholds, CourtGeometry, Thresholds, TriangulationThresholds

F64 = NDArray[np.float64]


@dataclass(frozen=True)
class GeometryContext:
    """The thresholds the triangulation needs, picked from the loaded file."""

    court: CourtGeometry
    calibration: CalibrationThresholds
    triangulation: TriangulationThresholds
    gravity_mps2: float

    @classmethod
    def from_thresholds(cls, th: Thresholds) -> GeometryContext:
        return cls(th.court, th.calibration, th.triangulation, th.ball.gravity_mps2)


@dataclass(frozen=True)
class SyncEstimate:
    """Offset of camera B's clock against camera A's, and how well the rays meet at it."""

    offset_ms: float
    median_gap_m: float
    pairs: int


@dataclass(frozen=True, eq=False)
class _Track:
    times_ms: F64
    frames: F64
    pixels: F64
    confidence: F64
    interpolated: NDArray[np.bool_]


def _as_track(points: list[TrackPoint] | tuple[TrackPoint, ...]) -> _Track:
    pts = sorted(points, key=lambda p: p.frame)
    return _Track(
        times_ms=np.array([p.time_ms for p in pts], dtype=np.float64),
        frames=np.array([p.frame for p in pts], dtype=np.float64),
        pixels=np.array([[p.x_px, p.y_px] for p in pts], dtype=np.float64).reshape(-1, TWO),
        confidence=np.array([p.confidence for p in pts], dtype=np.float64),
        interpolated=np.array([p.interpolated for p in pts], dtype=bool),
    )


def _sample(track: _Track, t_ms: F64, max_gap_ms: float) -> tuple[F64, F64, NDArray[np.bool_]]:
    """Pixels and confidence of a track at arbitrary times, plus which times are covered."""
    if len(track.times_ms) < TWO:
        empty = np.zeros(len(t_ms), dtype=bool)
        return np.zeros((len(t_ms), TWO)), np.zeros(len(t_ms)), empty
    idx = np.clip(np.searchsorted(track.times_ms, t_ms), 1, len(track.times_ms) - 1)
    left, right = track.times_ms[idx - 1], track.times_ms[idx]
    covered = (t_ms >= left) & (t_ms <= right) & ((right - left) <= max_gap_ms)
    u = np.where(right > left, (t_ms - left) / np.where(right > left, right - left, 1.0), 0.0)
    px = np.column_stack(
        [(1 - u) * track.pixels[idx - 1, k] + u * track.pixels[idx, k] for k in range(TWO)]
    )
    conf = np.minimum(track.confidence[idx - 1], track.confidence[idx])
    return px, conf, covered


def _closest_points(o1: F64, d1: F64, o2: F64, d2: F64) -> tuple[F64, F64, F64, F64]:
    """Midpoint, gap, sin(angle) between the lines and a validity mask (both in front)."""
    w0 = o1 - o2
    b = np.sum(d1 * d2, axis=1)
    d = np.sum(d1 * w0, axis=1)
    e = np.sum(d2 * w0, axis=1)
    denom = 1.0 - b * b
    safe = np.where(denom > 0, denom, 1.0)
    s = (b * e - d) / safe
    t = (e - b * d) / safe
    p1 = o1 + s[:, None] * d1
    p2 = o2 + t[:, None] * d2
    gap = np.linalg.norm(p1 - p2, axis=1)
    front = ((s > 0) & (t > 0)).astype(np.float64)
    return (p1 + p2) * HALF, gap, np.sqrt(np.maximum(denom, 0.0)), front


def estimate_offset(
    cal_a: CourtCalibration,
    cal_b: CourtCalibration,
    track_a: list[TrackPoint],
    track_b: list[TrackPoint],
    tri: TriangulationThresholds,
) -> SyncEstimate | None:
    """Fine clock offset of B against A (positive: B's true time is later than its stamp).

    Returns None if there are fewer than ``sync_min_pairs`` usable frame pairs.
    """
    a, b = _as_track(track_a), _as_track(track_b)
    keep = a.confidence >= tri.min_confidence
    a_px, a_t = a.pixels[keep], a.times_ms[keep]
    if len(a_t) < tri.sync_min_pairs:
        return None
    o_a = np.tile(cal_a.camera_center, (len(a_t), 1))
    d_a = undistorted_rays(cal_a, a_px)
    min_sin = np.sin(np.radians(tri.min_ray_angle_deg))
    offsets = np.arange(
        -tri.sync_search_ms, tri.sync_search_ms + tri.sync_step_ms, tri.sync_step_ms
    )
    costs = np.full(len(offsets), np.inf)
    counts = np.zeros(len(offsets), dtype=int)
    for i, delta in enumerate(offsets):
        b_px, b_conf, covered = _sample(b, a_t - delta, tri.max_time_gap_ms)
        ok = covered & (b_conf >= tri.min_confidence)
        if int(ok.sum()) < tri.sync_min_pairs:
            continue
        o_b = np.tile(cal_b.camera_center, (int(ok.sum()), 1))
        d_b = undistorted_rays(cal_b, b_px[ok])
        _, gap, sin_angle, front = _closest_points(o_a[ok], d_a[ok], o_b, d_b)
        good = (sin_angle >= min_sin) & (front > 0)
        if int(good.sum()) < tri.sync_min_pairs:
            continue
        costs[i] = float(np.median(gap[good]))
        counts[i] = int(good.sum())
    if not np.isfinite(costs).any():
        return None
    best = int(np.argmin(costs))
    delta = float(offsets[best])
    if (
        0 < best < len(offsets) - 1
        and np.isfinite(costs[best - 1])
        and np.isfinite(costs[best + 1])
    ):
        lo, mid, hi = costs[best - 1], costs[best], costs[best + 1]
        curvature = lo - TWO * mid + hi
        if curvature > 0:
            delta += float(HALF * (lo - hi) / curvature * tri.sync_step_ms)
    return SyncEstimate(delta, float(costs[best]), int(counts[best]))


@dataclass(frozen=True, eq=False)
class _Samples:
    """Both tracks resampled on one timeline (camera A's clock)."""

    frames: list[int]
    times_ms: F64
    a_px: F64
    b_px: F64
    a_conf: F64
    b_conf: F64
    a_ok: NDArray[np.bool_]
    b_ok: NDArray[np.bool_]
    a_interp: NDArray[np.bool_]
    b_interp: NDArray[np.bool_]


def _nearest_flag(track: _Track, t_ms: F64) -> NDArray[np.bool_]:
    if len(track.times_ms) == 0:
        return np.zeros(len(t_ms), dtype=bool)
    idx = np.clip(np.searchsorted(track.times_ms, t_ms), 1, max(len(track.times_ms) - 1, 1))
    idx = np.minimum(idx, len(track.times_ms) - 1)
    left = np.maximum(idx - 1, 0)
    pick = np.where(
        np.abs(track.times_ms[left] - t_ms) <= np.abs(track.times_ms[idx] - t_ms), left, idx
    )
    return np.asarray(track.interpolated[pick], dtype=bool)


def _resample(a: _Track, b: _Track, offset_ms: float, tri: TriangulationThresholds) -> _Samples:
    """Timeline of A's frames plus the frames only B saw (moved onto A's clock)."""
    time_by_frame = {int(f): float(t) for f, t in zip(a.frames, a.times_ms, strict=True)}
    for frame, t in zip(b.frames, b.times_ms + offset_ms, strict=True):
        time_by_frame.setdefault(int(frame), float(t))
    frames = sorted(time_by_frame)
    times = np.array([time_by_frame[f] for f in frames], dtype=np.float64)
    a_px, a_conf, a_cov = _sample(a, times, tri.max_time_gap_ms)
    b_px, b_conf, b_cov = _sample(b, times - offset_ms, tri.max_time_gap_ms)
    return _Samples(
        frames,
        times,
        a_px,
        b_px,
        a_conf,
        b_conf,
        a_cov & (a_conf >= tri.min_confidence),
        b_cov & (b_conf >= tri.min_confidence),
        _nearest_flag(a, times),
        _nearest_flag(b, times - offset_ms),
    )


def _triangulate_pairs(
    cal_a: CourtCalibration, cal_b: CourtCalibration, smp: _Samples, context: GeometryContext
) -> tuple[F64, NDArray[np.bool_]]:
    """3D points for the frames both cameras saw, and which of them are consistent."""
    court, tri = context.court, context.triangulation
    margin_m = context.calibration.court_mask_margin_m
    position = np.full((len(smp.frames), THREE), np.nan)
    good = np.zeros(len(smp.frames), dtype=bool)
    both = smp.a_ok & smp.b_ok
    if not both.any():
        return position, good
    idx = np.flatnonzero(both)
    o_a = np.tile(cal_a.camera_center, (len(idx), 1))
    o_b = np.tile(cal_b.camera_center, (len(idx), 1))
    d_a = undistorted_rays(cal_a, smp.a_px[idx])
    d_b = undistorted_rays(cal_b, smp.b_px[idx])
    mid, gap, sin_angle, front = _closest_points(o_a, d_a, o_b, d_b)
    valid = (
        (sin_angle >= np.sin(np.radians(tri.min_ray_angle_deg)))
        & (front > 0)
        & (gap <= tri.max_ray_gap_m)
        & (mid[:, THREE - 1] >= tri.min_height_m)
        & (mid[:, THREE - 1] <= tri.max_height_m)
        & (mid[:, 0] >= -margin_m)
        & (mid[:, 0] <= court.width_m + margin_m)
        & (mid[:, 1] >= -margin_m)
        & (mid[:, 1] <= court.length_m + margin_m)
    )
    position[idx[valid]] = mid[valid]
    good[idx[valid]] = True
    return position, good


def _bridge_single_camera(
    cal: CourtCalibration,
    pixel: F64,
    t_ms: float,
    left: tuple[float, F64],
    right: tuple[float, F64],
    *,
    gravity: float,
    max_gap_m: float,
    min_sin_angle: float,
) -> F64 | None:
    """Place a one-camera sighting on its ray, near the ballistic path between two 3D fixes.

    The ball between two triangulated points follows (to a good approximation) a parabola.
    The point of the camera ray closest to that parabola is the position at ``t_ms``. If the
    ray misses the parabola by more than ``max_gap_m`` something happened in between (a bounce
    or a hit) and the caller keeps the plain 2D position.
    """
    (t0, p0), (t1, p1) = left, right
    u = (t_ms - t0) / (t1 - t0)
    expected = p0 + u * (p1 - p0)
    expected[THREE - 1] += HALF * gravity * ((t_ms - t0) / MS_PER_S) * ((t1 - t_ms) / MS_PER_S)
    origin = cal.camera_center
    direction = undistorted_rays(cal, pixel.reshape(1, TWO))[0]
    path = (p1 - p0) / max(float(np.linalg.norm(p1 - p0)), np.finfo(float).eps)
    if float(np.linalg.norm(np.cross(direction, path))) < min_sin_angle:
        return None  # the ray runs along the path: its depth cannot be told
    along = float(np.dot(expected - origin, direction))
    if along <= 0.0:
        return None
    point = origin + along * direction
    if float(np.linalg.norm(point - expected)) > max_gap_m:
        return None
    return np.asarray(point, dtype=np.float64)


def triangulate_ball(
    cal_a: CourtCalibration,
    cal_b: CourtCalibration,
    track_a: list[TrackPoint],
    track_b: list[TrackPoint],
    *,
    offset_ms: float,
    context: GeometryContext,
) -> list[BallObservation]:
    """One observation per frame of camera A's clock: 3D when the cameras agree, else 2D.

    A frame is 3D (``z_m`` set) when

    * both cameras saw the ball with confidence at that instant, their rays form a usable
      angle, pass within ``max_ray_gap_m`` of each other and cross inside the court volume, or
    * only one camera saw it, but two triangulated fixes within ``max_bridge_ms`` on both
      sides give a ballistic path that the ray follows (a short blind spot of one camera).

    Any other sighting is returned as the floor position seen by the camera (the nearest if
    both), with ``z_m = None``, unless it falls outside the court area, where a floor position
    carries no information (the ball is high and far).
    """
    court, tri = context.court, context.triangulation
    margin = context.calibration.court_mask_margin_m
    smp = _resample(_as_track(track_a), _as_track(track_b), offset_ms, tri)
    position, is3d = _triangulate_pairs(cal_a, cal_b, smp, context)
    fixes = np.flatnonzero(is3d)
    floor_a = undistorted_to_court(cal_a, smp.a_px)
    floor_b = undistorted_to_court(cal_b, smp.b_px)
    out: list[BallObservation] = []
    for i, frame in enumerate(smp.frames):
        if not (smp.a_ok[i] or smp.b_ok[i]):
            continue
        use_a = bool(smp.a_ok[i])
        if smp.a_ok[i] and smp.b_ok[i]:
            da = float(np.linalg.norm(floor_a[i] - cal_a.camera_center[:TWO]))
            db = float(np.linalg.norm(floor_b[i] - cal_b.camera_center[:TWO]))
            use_a = da <= db
        conf = float(smp.a_conf[i] if use_a else smp.b_conf[i])
        interpolated = bool(smp.a_interp[i] if use_a else smp.b_interp[i])
        point: F64 | None = position[i] if is3d[i] else None
        if is3d[i]:
            conf = float(min(smp.a_conf[i], smp.b_conf[i]))
            interpolated = bool(smp.a_interp[i] or smp.b_interp[i])
        else:
            before = fixes[fixes < i]
            after = fixes[fixes > i]
            if len(before) and len(after):
                lo, hi = int(before[-1]), int(after[0])
                if (
                    smp.times_ms[i] - smp.times_ms[lo] <= tri.max_bridge_ms
                    and smp.times_ms[hi] - smp.times_ms[i] <= tri.max_bridge_ms
                ):
                    point = _bridge_single_camera(
                        cal_a if use_a else cal_b,
                        smp.a_px[i] if use_a else smp.b_px[i],
                        float(smp.times_ms[i]),
                        (float(smp.times_ms[lo]), position[lo]),
                        (float(smp.times_ms[hi]), position[hi]),
                        gravity=context.gravity_mps2,
                        max_gap_m=tri.max_ray_gap_m,
                        min_sin_angle=float(np.sin(np.radians(tri.min_ray_angle_deg))),
                    )
        if point is not None:
            pos = BallPosition(
                x_m=float(point[0]), y_m=float(point[1]), z_m=float(point[THREE - 1])
            )
        else:
            fx, fy = (float(v) for v in (floor_a[i] if use_a else floor_b[i]))
            if not (
                -margin <= fx <= court.width_m + margin and -margin <= fy <= court.length_m + margin
            ):
                continue
            pos = BallPosition(x_m=fx, y_m=fy, z_m=None)
        out.append(
            BallObservation(
                frame=frame,
                time_ms=max(round(float(smp.times_ms[i])), 0),
                confidence=min(max(conf, 0.0), 1.0),
                position=pos,
                interpolated=interpolated,
            )
        )
    return out


def single_camera_observations(
    cal: CourtCalibration, track: list[TrackPoint], context: GeometryContext
) -> list[BallObservation]:
    """Only one camera: the floor position under the ball's apparent location (no height)."""
    tri, court = context.triangulation, context.court
    margin = context.calibration.court_mask_margin_m
    out: list[BallObservation] = []
    pts = [p for p in track if p.confidence >= tri.min_confidence]
    if not pts:
        return out
    floor = undistorted_to_court(cal, np.array([[p.x_px, p.y_px] for p in pts]))
    for point, (fx, fy) in zip(pts, floor, strict=True):
        if not (
            -margin <= fx <= court.width_m + margin and -margin <= fy <= court.length_m + margin
        ):
            continue
        out.append(
            BallObservation(
                frame=point.frame,
                time_ms=point.time_ms,
                confidence=point.confidence,
                position=BallPosition(x_m=float(fx), y_m=float(fy), z_m=None),
                interpolated=point.interpolated,
            )
        )
    return out
