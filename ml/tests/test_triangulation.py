"""Issue #125: two-camera clock alignment and 3D triangulation of the ball."""

from __future__ import annotations

import numpy as np
import pytest
from sim.camera import PROFILES, make_camera, true_intrinsics
from sim.measure import measure_triangulation, thresholds
from sim.pipeline import perfect_calibration
from sim.synthetic import GRAVITY, Leg, chain

from ml.ball.records import TrackPoint
from ml.ball.speed import speed_after
from ml.ball.triangulate import (
    GeometryContext,
    estimate_offset,
    single_camera_observations,
    triangulate_ball,
)
from ml.geometry.calibration import CourtCalibration, undistort_pixels
from ml.schemas import BallObservation, Camera

TH = thresholds()
CTX = GeometryContext.from_thresholds(TH)
FPS = 60.0
CAM = {n: make_camera(n, TH.court) for n in "AB"}
CAL = {n: perfect_calibration(CAM[n], TH) for n in "AB"}


def _flight() -> list[Leg]:
    """A lob over the net and a drive back: a smooth 4 s path between the two cameras."""
    return chain((3.0, 3.0, 1.2), [((2.0, 9.0, 8.0), 1.8), ((-3.0, 5.0, 3.0), 1.2)])


FLIGHT = _flight()


def _ball(t: float) -> np.ndarray:
    for index, leg in enumerate(FLIGHT):
        if t <= leg.duration_s or index == len(FLIGHT) - 1:
            x, y, z = leg.start
            vx, vy, vz = leg.velocity
            return np.array([x + vx * t, y + vy * t, z + vz * t - 0.5 * GRAVITY * t * t])
        t -= leg.duration_s
    raise AssertionError


def _track(
    name: str,
    clock_offset_ms: float = 0.0,
    frames: range | None = None,
    pixel_noise: float = 0.0,
    confidence: float = 0.9,
    seed: int = 0,
) -> list[TrackPoint]:
    rng = np.random.default_rng(seed)
    out: list[TrackPoint] = []
    for k in range(int(3.0 * FPS)) if frames is None else frames:
        true_t = k / FPS + clock_offset_ms / 1000.0
        px = CAM[name].project(_ball(true_t).reshape(1, 3))
        und = undistort_pixels(true_intrinsics(), px)[0] + rng.normal(0.0, pixel_noise, 2)
        out.append(
            TrackPoint(
                camera=Camera(name),
                frame=k,
                time_ms=round(k / FPS * 1000),
                confidence=confidence,
                x_px=float(und[0]),
                y_px=float(und[1]),
                vx_px_s=0.0,
                vy_px_s=0.0,
            )
        )
    return out


def _errors_cm(obs: list[BallObservation]) -> np.ndarray:
    return np.array(
        [
            np.linalg.norm(
                np.array([o.position.x_m, o.position.y_m, o.position.z_m]) - _ball(o.time_ms / 1000)
            )
            * 100
            for o in obs
            if o.position.z_m is not None
        ]
    )


def _triangulate(
    a: list[TrackPoint], b: list[TrackPoint], offset_ms: float = 0.0
) -> list[BallObservation]:
    return triangulate_ball(CAL["A"], CAL["B"], a, b, offset_ms=offset_ms, context=CTX)


def test_exact_pixels_triangulate_to_half_a_centimetre() -> None:
    obs = _triangulate(_track("A"), _track("B"))
    errors = _errors_cm(obs)
    assert len(errors) > 100
    assert errors.max() < 0.5


@pytest.mark.parametrize("offset", [-40.0, -17.0, 0.0, 9.0, 33.0])
def test_the_clock_offset_between_cameras_is_found_from_the_trajectories(offset: float) -> None:
    sync = estimate_offset(CAL["A"], CAL["B"], _track("A"), _track("B", offset), TH.triangulation)
    assert sync is not None
    assert sync.offset_ms == pytest.approx(offset, abs=1.0)
    assert sync.median_gap_m < 0.05


def test_a_wrong_offset_puts_the_ball_off_and_the_right_one_fixes_it() -> None:
    a, b = _track("A"), _track("B", 30.0)
    wrong = _errors_cm(_triangulate(a, b, 0.0))
    right = _errors_cm(_triangulate(a, b, 30.0))
    assert np.median(right) < 1.0
    assert np.median(wrong) > 10 * np.median(right)


def test_the_offset_needs_enough_frames_in_common() -> None:
    assert (
        estimate_offset(
            CAL["A"], CAL["B"], _track("A", frames=range(5)), _track("B"), TH.triangulation
        )
        is None
    )
    assert estimate_offset(CAL["A"], CAL["B"], [], _track("B"), TH.triangulation) is None


def test_with_one_camera_the_position_is_the_floor_point_without_height() -> None:
    b_only = _track("B", frames=range(0, 0))
    obs = _triangulate(_track("A"), b_only)
    assert obs
    assert all(o.position.z_m is None for o in obs)
    assert all(-1.5 <= o.position.x_m <= 11.5 and -1.5 <= o.position.y_m <= 21.5 for o in obs)


def test_a_floor_ball_is_exact_in_2d() -> None:
    low = single_camera_observations(CAL["A"], [_floor_point()], CTX)
    assert low[0].position.z_m is None
    assert (low[0].position.x_m, low[0].position.y_m) == pytest.approx((4.0, 6.0), abs=0.01)


def _floor_point() -> TrackPoint:
    px = CAM["A"].project(np.array([[4.0, 6.0, 0.0]]))
    und = undistort_pixels(true_intrinsics(), px)[0]
    return TrackPoint(
        camera=Camera.A,
        frame=0,
        time_ms=0,
        confidence=0.9,
        x_px=float(und[0]),
        y_px=float(und[1]),
        vx_px_s=0.0,
        vy_px_s=0.0,
    )


def test_a_short_blind_spot_of_one_camera_is_bridged_in_3d() -> None:
    b = [p for p in _track("B") if not 60 <= p.frame < 75]
    obs = {o.frame: o for o in _triangulate(_track("A"), b)}
    for frame in range(60, 75):
        assert obs[frame].position.z_m is not None
        truth = _ball(frame / FPS)
        got = np.array([obs[frame].position.x_m, obs[frame].position.y_m, obs[frame].position.z_m])
        assert np.linalg.norm(got - truth) < 0.1


def test_a_long_blind_spot_falls_back_to_2d() -> None:
    bridge_frames = int(TH.triangulation.max_bridge_ms / 1000 * FPS)
    gap_end = 60 + 2 * bridge_frames + 20
    b = [p for p in _track("B") if not 60 <= p.frame < gap_end]
    obs = {o.frame: o for o in _triangulate(_track("A"), b)}
    middle = 60 + (gap_end - 60) // 2
    assert middle not in obs or obs[middle].position.z_m is None


def test_when_both_cameras_look_along_the_same_line_it_does_not_invent_a_height() -> None:
    # A ball at the camera height in the middle of the court: both rays are one line.
    cams = {n: CAM[n] for n in "AB"}
    point = np.array([[5.0, 10.0, 6.0]])
    tracks = {}
    for n in "AB":
        und = undistort_pixels(true_intrinsics(), cams[n].project(point))[0]
        tracks[n] = [
            TrackPoint(
                camera=Camera(n),
                frame=k,
                time_ms=round(k / FPS * 1000),
                confidence=0.9,
                x_px=float(und[0]),
                y_px=float(und[1]),
                vx_px_s=0.0,
                vy_px_s=0.0,
            )
            for k in range(30)
        ]
    obs = _triangulate(tracks["A"], tracks["B"])
    assert all(o.position.z_m is None for o in obs)


def test_rays_that_do_not_meet_never_give_a_wrong_3d_point() -> None:
    a, b = _track("A"), _track("B")
    b = [
        p.model_copy(update={"x_px": p.x_px + 120.0, "y_px": p.y_px - 80.0})
        if 30 <= p.frame < 60
        else p
        for p in b
    ]
    obs = {o.frame: o for o in _triangulate(a, b)}
    for frame in range(35, 55):
        if frame in obs and obs[frame].position.z_m is not None:
            got = obs[frame].position
            truth = _ball(obs[frame].time_ms / 1000)
            assert np.linalg.norm(np.array([got.x_m, got.y_m, got.z_m]) - truth) < 0.15
    assert obs[100].position.z_m is not None


def test_a_camera_that_is_not_confident_does_not_vote() -> None:
    b = _track("B", confidence=TH.triangulation.min_confidence / 2)
    obs = _triangulate(_track("A"), b)
    assert all(o.position.z_m is None for o in obs)


def test_the_speed_after_a_shot_comes_from_the_3d_positions() -> None:
    obs = _triangulate(_track("A"), _track("B"))
    t_ms = 1000
    idx = next(i for i, o in enumerate(obs) if o.time_ms >= t_ms)
    here, nxt = _ball(obs[idx].time_ms / 1000), _ball(obs[idx + 5].time_ms / 1000)
    dt = (obs[idx + 5].time_ms - obs[idx].time_ms) / 1000
    expected = float(np.linalg.norm(nxt - here)) / dt
    got = speed_after(obs, t_ms, 6, gravity=TH.ball.gravity_mps2)
    assert got is not None
    assert got == pytest.approx(expected, rel=0.08)


def test_speed_needs_height_and_enough_frames() -> None:
    flat = [
        o.model_copy(update={"position": o.position.model_copy(update={"z_m": None})})
        for o in _triangulate(_track("A"), _track("B"))
    ]
    assert speed_after(flat, 500, 3, gravity=TH.ball.gravity_mps2) is None
    assert speed_after([], 500, 3, gravity=TH.ball.gravity_mps2) is None


def test_calibrations_used_here_have_the_cameras_where_they_are() -> None:
    cal: CourtCalibration = CAL["A"]
    assert cal.camera_center == pytest.approx(CAM["A"].position, abs=0.02)


@pytest.mark.parametrize(
    ("level", "share", "median_cm", "p95_cm", "offset_ms"),
    [
        ("low", 0.98, 3.0, 10.0, 1.5),
        ("medium", 0.98, 5.0, 18.0, 1.5),
        ("high", 0.95, 9.0, 30.0, 4.0),
    ],
)
def test_triangulation_accuracy_on_simulated_matches(
    level: str, share: float, median_cm: float, p95_cm: float, offset_ms: float
) -> None:
    s = measure_triangulation(PROFILES[level], range(10))
    assert s.frames_3d / s.frames >= share
    assert np.median(s.err_cm) <= median_cm
    assert np.percentile(s.err_cm, 95) <= p95_cm
    assert np.mean(np.abs(s.offset_err_ms)) <= offset_ms


@pytest.mark.parametrize("level", ["low", "medium", "high"])
def test_the_height_is_inside_the_tolerance_of_the_thresholds_file(level: str) -> None:
    s = measure_triangulation(PROFILES[level], range(10))
    tolerance_cm = TH.triangulation.height_tolerance_m * 100
    assert np.percentile(s.z_err_cm, 95) <= tolerance_cm
    wild = np.mean(np.array(s.z_err_cm) > 3 * tolerance_cm)
    assert wild <= 0.005, "gross height errors must stay rare"


@pytest.mark.parametrize(("level", "limit_pct"), [("low", 5.0), ("medium", 6.0), ("high", 8.0)])
def test_ball_speed_after_a_shot_with_six_frames(level: str, limit_pct: float) -> None:
    s = measure_triangulation(PROFILES[level], range(10))
    assert np.median(s.speed_err_pct[6]) <= limit_pct


def test_three_frames_are_too_few_for_a_precise_speed() -> None:
    """The spec asks for the 3 frames after the shot; with pixel noise that is a rough value."""
    s = measure_triangulation(PROFILES["medium"], range(10))
    assert np.median(s.speed_err_pct[3]) > np.median(s.speed_err_pct[6])
