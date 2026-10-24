"""Measure every stage against the simulator ground truth, at a given noise level."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np

from ml.ball.speed import speed_after
from ml.ball.track import smooth_track
from ml.events.bounces import detect_bounces
from ml.events.shots import detect_shots
from ml.geometry.calibration import (
    CalibrationRejectedError,
    calibrate,
    check_drift,
    pixel_to_court,
    undistort_pixels,
)
from ml.geometry.court import SurfacePlan, default_surface_plan
from ml.schemas import Camera
from ml.thresholds import Thresholds, load_thresholds
from sim.camera import (
    PROFILES,
    NoiseProfile,
    estimated_intrinsics,
    make_camera,
    marked_points,
)
from sim.pipeline import run_cameras, to_records
from sim.rally import Rally, make_rally
from sim.scoring import (
    RESOLUTION_S,
    Matching,
    contact_clusters,
    match_times,
    merge,
    score_events,
    wrist_samples,
)

TOLERANCE_S = 0.1
GAP_TOLERANCE_PX = 6.0
GRID_STEP_M = 1.0
SPEED_FRAMES = (3, 6, 12)


@lru_cache(maxsize=1)
def thresholds() -> Thresholds:
    return load_thresholds()


@lru_cache(maxsize=1)
def plan() -> SurfacePlan:
    return default_surface_plan(thresholds().court)


@lru_cache(maxsize=64)
def rally(seed: int) -> Rally:
    return make_rally(random.Random(seed), plan())


@dataclass
class CalibrationStats:
    in_sample_cm: list[float] = field(default_factory=list)
    grid_mean_cm: list[float] = field(default_factory=list)
    grid_max_cm: list[float] = field(default_factory=list)
    rejected: int = 0
    total: int = 0
    drift_moved_fixed: int = 0
    drift_moved_shifted: int = 0


@lru_cache(maxsize=256)
def measure_calibration(noise: NoiseProfile, trials: int = 20) -> CalibrationStats:
    th = thresholds()
    out = CalibrationStats()
    xs = np.arange(0.0, th.court.width_m + GRID_STEP_M / 2, GRID_STEP_M)
    ys = np.arange(0.0, th.court.length_m + GRID_STEP_M / 2, GRID_STEP_M)
    grid = np.array([(x, y) for x in xs for y in ys])
    for seed in range(trials):
        for name in "AB":
            rng = random.Random(1000 * seed + ord(name))
            cam = make_camera(name, th.court)
            intr = estimated_intrinsics(rng, noise)
            marks = marked_points(cam, th.court, rng, noise)
            out.total += 1
            try:
                cal = calibrate(marks, intr, th.court, th.calibration)
            except CalibrationRejectedError:
                out.rejected += 1
                continue
            px = cam.project(np.column_stack([grid, np.zeros(len(grid))]))
            err = np.linalg.norm(pixel_to_court(cal, px) - grid, axis=1) * 100.0
            out.in_sample_cm.append(cal.mean_error_cm)
            out.grid_mean_cm.append(float(err.mean()))
            out.grid_max_cm.append(float(err.max()))
    return out


@dataclass
class TrackStats:
    gap_frames: int = 0
    gap_filled_ok: int = 0
    long_gap_frames: int = 0
    long_gap_filled: int = 0
    false_total: int = 0
    false_rejected: int = 0
    true_total: int = 0
    true_rejected: int = 0
    raw_err_px: list[float] = field(default_factory=list)
    smooth_err_px: list[float] = field(default_factory=list)


def _runs(silent: set[int], last: int) -> list[list[int]]:
    runs: list[list[int]] = []
    cur: list[int] = []
    for f in range(last + 1):
        if f in silent:
            cur.append(f)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return runs


@lru_cache(maxsize=256)
def measure_tracks(noise: NoiseProfile, seeds: range, fps: float = 60.0) -> TrackStats:
    th = thresholds()
    stats = TrackStats()
    for seed in seeds:
        run = run_cameras(rally(seed), th, noise, seed, fps)
        for name in "AB":
            cal = run.cals[name]
            truth = run.truth_px[name]
            pts = {p.frame: p for p in run.smoothed[name].points}
            und_truth = {
                f: undistort_pixels(cal.intrinsics, np.array([xy]))[0] for f, xy in truth.items()
            }
            for run_frames in _runs(run.silent[name], max(truth) if truth else 0):
                short = len(run_frames) <= th.ball.kalman_max_gap_frames
                for f in run_frames:
                    if f not in und_truth:
                        continue
                    if short:
                        stats.gap_frames += 1
                        p = pts.get(f)
                        if (
                            p is not None
                            and np.hypot(p.x_px - und_truth[f][0], p.y_px - und_truth[f][1])
                            <= GAP_TOLERANCE_PX
                        ):
                            stats.gap_filled_ok += 1
                    else:
                        stats.long_gap_frames += 1
                        stats.long_gap_filled += int(f in pts and pts[f].interpolated)
            rejected = {(d.frame, d.x_px, d.y_px) for d in run.smoothed[name].rejected}
            for d in run.raw[name]:
                key = (d.frame, d.x_px, d.y_px)
                if d.truth_xy is None:
                    stats.false_total += 1
                    stats.false_rejected += int(key in rejected)
                else:
                    stats.true_total += 1
                    stats.true_rejected += int(key in rejected)
                    f = d.frame
                    if f in und_truth:
                        raw_u = undistort_pixels(cal.intrinsics, np.array([[d.x_px, d.y_px]]))[0]
                        stats.raw_err_px.append(float(np.hypot(*(raw_u - und_truth[f]))))
                        p = pts.get(f)
                        if p is not None:
                            stats.smooth_err_px.append(
                                float(np.hypot(p.x_px - und_truth[f][0], p.y_px - und_truth[f][1]))
                            )
    return stats


@dataclass
class TriStats:
    frames: int = 0
    frames_3d: int = 0
    err_cm: list[float] = field(default_factory=list)
    z_err_cm: list[float] = field(default_factory=list)
    z_err_by_height: dict[str, list[float]] = field(default_factory=dict)
    offset_err_ms: list[float] = field(default_factory=list)
    speed_err_pct: dict[int, list[float]] = field(default_factory=dict)


@lru_cache(maxsize=256)
def measure_triangulation(noise: NoiseProfile, seeds: range, fps: float = 60.0) -> TriStats:
    th = thresholds()
    out = TriStats(z_err_by_height={"<1 m": [], "1-3 m": [], ">3 m": []})
    for seed in seeds:
        rl = rally(seed)
        run = run_cameras(rl, th, noise, seed, fps)
        if run.sync is not None:
            out.offset_err_ms.append(run.sync.offset_ms - noise.clock_offset_ms)
        times = np.array([o.time_ms / 1000.0 for o in run.observations])
        truth = rl.ball_at(times)
        for o, g in zip(run.observations, truth, strict=True):
            out.frames += 1
            if o.position.z_m is None:
                continue
            out.frames_3d += 1
            e = np.array([o.position.x_m, o.position.y_m, o.position.z_m]) - g
            out.err_cm.append(float(np.linalg.norm(e)) * 100)
            out.z_err_cm.append(abs(float(e[2])) * 100)
            key = "<1 m" if g[2] < 1 else "1-3 m" if g[2] < 3 else ">3 m"
            out.z_err_by_height[key].append(abs(float(e[2])) * 100)
        for h in rl.hits[1:]:
            idx = int(np.searchsorted(rl.times, h.time_s)) + 1
            true_speed = float(np.linalg.norm(rl.velocities[idx]))
            for frames in SPEED_FRAMES:
                est = speed_after(
                    run.observations,
                    round(h.time_s * 1000),
                    frames,
                    gravity=th.ball.gravity_mps2,
                )
                if est is not None:
                    out.speed_err_pct.setdefault(frames, []).append(
                        abs(est - true_speed) / true_speed * 100
                    )
    return out


@dataclass
class EventStats:
    shots: Matching = field(default_factory=lambda: Matching(0, 0, 0, ()))
    attributed: int = 0
    bounces: Matching = field(default_factory=lambda: Matching(0, 0, 0, ()))
    surface_ok: int = 0
    position_only_matched: int = 0
    merged_contacts: int = 0
    surface_ok_position_only: int = 0


@lru_cache(maxsize=256)
def measure_events(
    noise: NoiseProfile,
    seeds: range,
    fps: float = 60.0,
    cameras: str = "AB",
    wrist_height: bool = True,
) -> EventStats:
    th = thresholds()
    out = EventStats()
    for seed in seeds:
        rl = rally(seed)
        run = run_cameras(rl, th, noise, seed, fps, cameras)
        wr = wrist_samples(rl, fps, random.Random(seed + 7), noise, wrist_height)
        shots = detect_shots(run.observations, wr, plan(), th)
        bounces = detect_bounces(run.observations, plan(), th, wr)
        sc = score_events(rl, shots, bounces, TOLERANCE_S)
        out.shots = merge(out.shots, sc.shots)
        out.bounces = merge(out.bounces, sc.bounces)
        out.attributed += sc.shot_attribution_ok
        out.merged_contacts += sc.merged_contacts
        out.surface_ok += sc.surface_ok
        naive = detect_bounces(run.observations, plan(), th, wr, use_velocity_direction=False)
        m = match_times(
            [c.time_s for c in rl.contacts], [e.time_ms / 1000 for e in naive], TOLERANCE_S
        )
        out.position_only_matched += m.tp
        out.surface_ok_position_only += sum(
            1 for i, j in m.pairs if rl.contacts[i].surface == naive[j].surface
        )
    return out


__all__ = [
    "PROFILES",
    "Camera",
    "check_drift",
    "measure_calibration",
    "measure_events",
    "measure_tracks",
    "measure_triangulation",
    "smooth_track",
    "to_records",
]


@dataclass
class CornerStats:
    contacts: int = 0
    detected: int = 0
    surface_ok: int = 0
    detected_position_only: int = 0
    surface_ok_position_only: int = 0


@lru_cache(maxsize=256)
def measure_corners(noise: NoiseProfile, seeds: range) -> CornerStats:
    """Balls sent into the back corners: back glass versus side glass versus fence."""
    from sim.rally import make_corner_shot

    th = thresholds()
    out = CornerStats()
    for seed in seeds:
        rl = make_corner_shot(random.Random(seed), plan())
        run = run_cameras(rl, th, noise, seed)
        clusters = contact_clusters(rl.contacts, RESOLUTION_S)
        out.contacts += len(clusters)
        for velocity in (True, False):
            found = detect_bounces(
                run.observations, plan(), th, None, use_velocity_direction=velocity
            )
            matched = match_times(
                [c[0].time_s for c in clusters], [e.time_ms / 1000 for e in found], TOLERANCE_S
            )
            for i, j in matched.pairs:
                good = found[j].surface in {c.surface for c in clusters[i]}
                if velocity:
                    out.detected += 1
                    out.surface_ok += int(good)
                else:
                    out.surface_ok_position_only += int(good)
                    out.detected_position_only += 1
    return out
