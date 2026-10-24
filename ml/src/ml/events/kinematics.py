"""Local velocity before and after each instant of the ball track.

A shot or a bounce is a kink: the velocity just before and just after are different. Both are
estimated by fitting a line to the positions in a short window on each side of the instant,
leaving out a guard interval around it. In 3D the known pull of gravity is removed before the
fit so a free flight gives the same velocity on both sides.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from ml.geometry.consts import HALF, MS_PER_S, THREE, TWO
from ml.schemas import BallObservation

F64 = NDArray[np.float64]
MAX_REFINE_PASSES = THREE + TWO


@dataclass(frozen=True, eq=False)
class BallTrack:
    """Ball observations as arrays, in time order. ``z`` is NaN where only 2D is known."""

    times_s: F64
    positions: F64  # (N, 3)

    def __len__(self) -> int:
        return len(self.times_s)


@dataclass(frozen=True, eq=False)
class Kink:
    """Velocity change at an instant of the track."""

    index: int
    time_s: float
    position: F64  # (3,), z NaN in 2D
    v_before: F64  # (3,), z 0 in 2D
    v_after: F64
    dims: int
    residual: float = 0.0  # sum of squared fit residuals, m^2: low when the kink is centred

    @property
    def delta_v(self) -> F64:
        return np.asarray(self.v_after - self.v_before, dtype=np.float64)

    @property
    def speed_before(self) -> float:
        return float(np.linalg.norm(self.v_before[: self.dims]))

    @property
    def speed_after(self) -> float:
        return float(np.linalg.norm(self.v_after[: self.dims]))

    @property
    def direction_change_deg(self) -> float:
        a, b = self.v_before[: self.dims], self.v_after[: self.dims]
        denom = float(np.linalg.norm(a) * np.linalg.norm(b))
        if denom == 0.0:
            return 0.0
        cosine = float(np.clip(np.dot(a, b) / denom, -1.0, 1.0))
        return float(np.degrees(np.arccos(cosine)))

    @property
    def speed_change_share(self) -> float:
        top = max(self.speed_before, self.speed_after)
        return abs(self.speed_after - self.speed_before) / top if top > 0.0 else 0.0


def to_track(observations: list[BallObservation]) -> BallTrack:
    ordered = sorted(observations, key=lambda o: o.time_ms)
    return BallTrack(
        times_s=np.array([o.time_ms / MS_PER_S for o in ordered], dtype=np.float64),
        positions=np.array(
            [
                [
                    o.position.x_m,
                    o.position.y_m,
                    np.nan if o.position.z_m is None else o.position.z_m,
                ]
                for o in ordered
            ],
            dtype=np.float64,
        ).reshape(-1, THREE),
    )


@dataclass(frozen=True)
class KinkFit:
    """How velocities are fitted around an instant."""

    window_s: float
    guard_s: float
    min_points: int
    gravity: float


def _line(x: F64, y: F64) -> tuple[float, float]:
    """Least-squares slope and intercept; a vertical stack of equal x gives slope 0."""
    x_mean, y_mean = float(x.mean()), float(y.mean())
    spread = float(np.sum((x - x_mean) ** TWO))
    slope = float(np.sum((x - x_mean) * (y - y_mean)) / spread) if spread > 0.0 else 0.0
    return slope, y_mean - slope * x_mean


def _fit_side(t: F64, p: F64, dims: int, gravity: float, t0: float) -> tuple[F64, F64, float]:
    """Line through positions (gravity removed in 3D): position at t0, velocity, residual."""
    dt = t - t0
    corrected = p[:, :dims].copy()
    if dims == THREE:
        corrected[:, TWO] = corrected[:, TWO] + HALF * gravity * dt * dt
    pos = np.zeros(THREE)
    vel = np.zeros(THREE)
    residual = 0.0
    for axis in range(dims):
        slope, intercept = _line(dt, corrected[:, axis])
        vel[axis], pos[axis] = slope, intercept
        residual += float(np.sum((corrected[:, axis] - (intercept + slope * dt)) ** TWO))
    return pos, vel, residual


def kink_at_time(track: BallTrack, t0: float, index: int, fit: KinkFit) -> Kink | None:
    """Velocity before/after the instant ``t0``, or None if the data are too thin."""
    before = (track.times_s >= t0 - fit.window_s) & (track.times_s <= t0 - fit.guard_s)
    after = (track.times_s >= t0 + fit.guard_s) & (track.times_s <= t0 + fit.window_s)
    if int(before.sum()) < fit.min_points or int(after.sum()) < fit.min_points:
        return None
    height = np.isfinite(track.positions[:, TWO])
    if (
        int((before & height).sum()) >= fit.min_points
        and int((after & height).sum()) >= fit.min_points
    ):
        before, after, dims = before & height, after & height, THREE
    else:
        dims = TWO
    pb, vb, rb = _fit_side(track.times_s[before], track.positions[before], dims, fit.gravity, t0)
    pa, va, ra = _fit_side(track.times_s[after], track.positions[after], dims, fit.gravity, t0)
    # Instant where the two fitted paths meet: minimise |pb + vb s - pa - va s|.
    dv = vb[:dims] - va[:dims]
    denom = float(np.dot(dv, dv))
    shift = 0.0
    if denom > 0.0:
        shift = float(np.dot(pa[:dims] - pb[:dims], dv) / denom)
        shift = float(np.clip(shift, -fit.guard_s, fit.guard_s))
    position = np.full(THREE, np.nan)
    position[:dims] = (pb[:dims] + vb[:dims] * shift + pa[:dims] + va[:dims] * shift) * HALF
    return Kink(index, t0 + shift, position, vb, va, dims, rb + ra)


def all_kinks(track: BallTrack, fit: KinkFit) -> list[Kink]:
    out: list[Kink] = []
    for i in range(len(track)):
        kink = kink_at_time(track, float(track.times_s[i]), i, fit)
        if kink is not None:
            out.append(kink)
    return out


def refine_kink(track: BallTrack, kink: Kink, fit: KinkFit) -> Kink:
    """Slide the instant around a candidate and keep the one where both fits are cleanest.

    A candidate sits on an observation, so it can be a frame away from the real kink. When the
    instant is centred on the kink neither window contains the corner and the residual of the
    two line fits is smallest.
    """
    if len(track) < TWO:
        return kink
    frame_s = float(np.median(np.diff(track.times_s)))
    steps = np.linspace(-frame_s, frame_s, round(frame_s * MS_PER_S) + 1)
    best = kink
    for _ in range(MAX_REFINE_PASSES):
        start = best
        for offset in steps:
            candidate = kink_at_time(track, start.time_s + float(offset), kink.index, fit)
            if (
                candidate is not None
                and candidate.dims == kink.dims
                and candidate.residual < best.residual
            ):
                best = candidate
        if best is start:
            break
    return best


def centred_candidates(kinks: list[Kink], reach: int = 1) -> list[Kink]:
    """Keep the candidates whose two line fits are cleaner than their neighbours' fits.

    Around a real kink every candidate within a window looks like a kink, but only the one
    centred on it fits both sides with a straight line: the residual forms a V whose bottom
    is the kink. Input in observation order; the result keeps the bottoms of the V.
    """
    kept: list[Kink] = []
    for i, kink in enumerate(kinks):
        around = kinks[max(i - reach, 0) : i] + kinks[i + 1 : i + 1 + reach]
        if all(kink.residual <= other.residual for other in around):
            kept.append(kink)
    return kept
