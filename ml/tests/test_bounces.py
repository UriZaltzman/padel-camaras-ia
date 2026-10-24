"""Issue #128: bounce detection with surface classification."""

from __future__ import annotations

import math

import numpy as np
import pytest
from sim.camera import PROFILES
from sim.measure import measure_corners, measure_events, thresholds
from sim.synthetic import GRAVITY, Leg, chain, leg_end, leg_end_velocity, observations

from ml.events.bounces import detect_bounces
from ml.events.kinematics import Kink
from ml.events.records import WristSample
from ml.events.surfaces import nearest_surface_2d
from ml.geometry.court import Plane, SurfacePlan, WallSegment, default_surface_plan
from ml.schemas import BallObservation, BounceEvent, CourtSide, Surface

TH = thresholds()
COURT = TH.court
PLAN = default_surface_plan(COURT)
R = COURT.ball_radius_m
FPS = 60.0


def _rebound(
    start: tuple[float, float, float],
    velocity: tuple[float, float, float],
    wall_axis: int,
    wall_at: float,
    keep: float = 0.8,
    after_s: float = 0.6,
) -> tuple[list[BallObservation], float, tuple[float, float, float]]:
    """A flight into a plane perpendicular to ``wall_axis`` and the mirrored flight back.

    Returns the observations, the contact time and the contact position.
    """
    hit_t = (wall_at - start[wall_axis]) / velocity[wall_axis]
    first = Leg(start, velocity, hit_t)
    contact = leg_end(first)
    v_in = leg_end_velocity(first)
    v_out = list(v_in)
    v_out[wall_axis] = -keep * v_in[wall_axis]
    legs = [first, Leg(contact, (v_out[0], v_out[1], v_out[2]), after_s)]
    return observations(legs, FPS), hit_t, contact


def _only(events: list[BounceEvent]) -> BounceEvent:
    assert len(events) == 1, events
    return events[0]


def _detect(obs: list[BallObservation], **kwargs: object) -> list[BounceEvent]:
    return detect_bounces(obs, PLAN, TH, **kwargs)  # type: ignore[arg-type]


def _floor_bounce(x: float = 5.0, y: float = 6.0) -> tuple[list[BallObservation], float]:
    drop = Leg((x, y, 2.0), (0.0, 4.0, 0.0), math.sqrt(2 * (2.0 - R) / GRAVITY))
    land = leg_end(drop)
    v_in = leg_end_velocity(drop)
    rise = Leg((land[0], land[1], R), (v_in[0] * 0.82, v_in[1] * 0.82, -0.76 * v_in[2]), 0.6)
    return observations([drop, rise], FPS), drop.duration_s


def test_a_ball_that_falls_and_rises_bounces_on_the_floor() -> None:
    obs, t = _floor_bounce()
    event = _only(_detect(obs))
    assert event.surface == Surface.FLOOR
    assert abs(event.time_ms - t * 1000) <= 20
    assert event.position.z_m == pytest.approx(R, abs=0.1)
    assert event.side == CourtSide.A
    assert 0.0 < event.confidence <= 1.0


def test_the_side_of_the_net_comes_from_where_it_bounced() -> None:
    obs, _ = _floor_bounce(y=14.0)
    assert _only(_detect(obs)).side == CourtSide.B


@pytest.mark.parametrize(
    ("start", "velocity", "axis", "wall_at", "expected"),
    [
        ((5.0, 12.0, 1.8), (0.0, 12.0, 1.0), 1, COURT.length_m - R, Surface.BACK_GLASS),
        ((5.0, 8.0, 1.8), (0.0, -12.0, 1.0), 1, R, Surface.BACK_GLASS),
        ((3.0, 2.0, 1.8), (-12.0, 0.0, 1.0), 0, R, Surface.SIDE_GLASS),
        ((7.0, 18.0, 1.8), (12.0, 0.0, 1.0), 0, COURT.width_m - R, Surface.SIDE_GLASS),
        ((3.0, 10.0, 1.8), (-12.0, 0.0, 1.0), 0, R, Surface.FENCE),
        ((5.0, 12.0, 5.0), (0.0, 12.0, 1.0), 1, COURT.length_m - R, Surface.FENCE),
    ],
)
def test_the_surface_follows_the_glass_and_fence_plan(
    start: tuple[float, float, float],
    velocity: tuple[float, float, float],
    axis: int,
    wall_at: float,
    expected: Surface,
) -> None:
    obs, t, contact = _rebound(start, velocity, axis, wall_at)
    event = _only(_detect(obs))
    assert event.surface == expected
    assert abs(event.time_ms - t * 1000) <= 20
    assert (event.position.x_m, event.position.y_m) == pytest.approx(contact[:2], abs=0.1)


def test_each_court_loads_its_own_plan() -> None:
    all_glass = SurfacePlan(
        segments=(
            *PLAN.segments,
            WallSegment(
                plane=Plane.SIDE_LEFT,
                along_from_m=0.0,
                along_to_m=COURT.length_m,
                z_from_m=0.0,
                z_to_m=COURT.wall_height_m,
                surface=Surface.SIDE_GLASS,
            ),
        )
    )
    obs, _, _ = _rebound((3.0, 10.0, 1.8), (-12.0, 0.0, 1.0), 0, R)
    assert _only(detect_bounces(obs, PLAN, TH)).surface == Surface.FENCE
    # The first matching segment wins, so a court plan lists its segments in priority order.
    custom = SurfacePlan(segments=(all_glass.segments[-1], *PLAN.segments))
    assert _only(detect_bounces(obs, custom, TH)).surface == Surface.SIDE_GLASS


def test_the_default_plan_has_glass_ends_and_a_fence_centre() -> None:
    assert PLAN.surface_at(Plane.SIDE_LEFT, 2.0, 1.0) == Surface.SIDE_GLASS
    assert PLAN.surface_at(Plane.SIDE_LEFT, 10.0, 1.0) == Surface.FENCE
    assert PLAN.surface_at(Plane.SIDE_RIGHT, 18.5, 2.9) == Surface.SIDE_GLASS
    assert PLAN.surface_at(Plane.BACK_A, 5.0, 2.0) == Surface.BACK_GLASS
    assert PLAN.surface_at(Plane.BACK_A, 5.0, 3.5) == Surface.FENCE
    assert PLAN.surface_at(Plane.BACK_A, 5.0, 4.5) is None


def test_a_ball_over_the_wall_leaves_the_court_instead_of_bouncing() -> None:
    obs, _, _ = _rebound((5.0, 12.0, 7.0), (0.0, 12.0, 1.0), 1, COURT.length_m - R)
    assert _detect(obs) == []


def test_a_ball_that_dies_in_the_net_is_a_net_bounce() -> None:
    first = Leg((5.0, 7.0, 0.7), (0.0, 14.0, 0.5), (10.0 - R - 7.0) / 14.0)
    contact = leg_end(first)
    assert contact[2] < 0.88
    fall = Leg(contact, (0.0, -0.7, 0.0), 0.7)
    event = _only(_detect(observations([first, fall], FPS)))
    assert event.surface == Surface.NET
    assert event.position.y_m == pytest.approx(10.0, abs=0.25)


def test_a_ball_that_clears_the_net_does_not_bounce_on_it() -> None:
    legs = chain((5.0, 6.0, 1.6), [((0.0, 14.0, 2.0), 0.8)])
    assert _detect(observations(legs, FPS)) == []


def test_a_straight_flight_has_no_bounces() -> None:
    legs = chain((4.0, 3.0, 1.0), [((1.0, 10.0, 6.0), 1.5)])
    assert _detect(observations(legs, FPS, noise_m=0.02)) == []


def test_in_a_corner_the_velocity_decides_between_the_back_and_the_side_glass() -> None:
    """Noise leaves the ball nearer to the side wall by position, but it turned around in y."""
    obs, _, _ = _rebound((0.1 + R, 15.0, 1.8), (0.0, 12.0, 1.0), 1, COURT.length_m - R)
    # The positions are 25 cm short of the back wall: the side wall (10 cm away) looks closer.
    nudged = [
        o.model_copy(
            update={"position": o.position.model_copy(update={"y_m": o.position.y_m - 0.25})}
        )
        for o in obs
    ]
    with_velocity = _only(_detect(nudged))
    position_only = _only(_detect(nudged, use_velocity_direction=False))
    assert with_velocity.surface == Surface.BACK_GLASS
    assert position_only.surface == Surface.SIDE_GLASS, "the case the velocity direction fixes"


def test_two_bounces_in_a_row_are_two_events() -> None:
    first, t1 = _floor_bounce()
    drop = Leg((5.0, 8.0, 1.0), (0.0, 4.0, 0.0), math.sqrt(2 * (1.0 - R) / GRAVITY))
    land = leg_end(drop)
    v_in = leg_end_velocity(drop)
    rise = Leg((land[0], land[1], R), (0.0, v_in[1] * 0.8, -0.76 * v_in[2]), 0.6)
    second = observations([drop, rise], FPS)
    shifted = [
        o.model_copy(update={"time_ms": o.time_ms + 1000, "frame": o.frame + 100}) for o in second
    ]
    events = _detect([*first, *shifted])
    assert [e.surface for e in events] == [Surface.FLOOR, Surface.FLOOR]
    assert events[1].time_ms - events[0].time_ms > 500
    assert t1 > 0


def test_without_height_in_a_single_camera_setup_the_floor_position_is_used() -> None:
    obs, t, _ = _rebound((5.0, 12.0, 1.8), (0.0, 12.0, 1.0), 1, COURT.length_m - R)
    flat = [
        o.model_copy(update={"position": o.position.model_copy(update={"z_m": None})}) for o in obs
    ]
    event = _only(_detect(flat))
    assert event.position.z_m is None
    assert event.surface == Surface.BACK_GLASS
    assert abs(event.time_ms - t * 1000) <= 30


def test_in_a_two_camera_setup_a_floor_only_kink_is_not_called_a_bounce() -> None:
    obs, _ = _floor_bounce()
    mixed = [
        o.model_copy(update={"position": o.position.model_copy(update={"z_m": None})})
        if 40 <= i <= 60
        else o
        for i, o in enumerate(obs)
    ]
    assert _detect(mixed) == []


def test_a_kink_next_to_a_wrist_is_a_hit_and_not_a_bounce_without_height() -> None:
    legs = chain((5.0, 4.0, 1.0), [((0.0, 12.0, 0.0), 0.5), ((8.0, -9.0, 0.0), 0.6)])
    obs = observations(legs, FPS, with_height=False)
    hit = leg_end(legs[0])
    wrists = [
        WristSample(time_ms=t, track_id=0, x_m=hit[0] + 0.3, y_m=hit[1], foot_x_m=0.0, foot_y_m=0.0)
        for t in range(0, 1100, 16)
    ]
    assert detect_bounces(obs, PLAN, TH, wrists) == []
    assert len(detect_bounces(obs, PLAN, TH, [])) == 1


def test_the_apparent_floor_position_names_a_surface_for_one_camera() -> None:
    def kink_at(x: float, y: float) -> Kink:
        zeros = np.zeros(3)
        return Kink(0, 0.0, np.array([x, y, np.nan]), zeros, zeros, 2)

    assert nearest_surface_2d(kink_at(5.0, 0.1), PLAN, COURT, TH.bounces) == Surface.BACK_GLASS
    assert nearest_surface_2d(kink_at(0.1, 2.0), PLAN, COURT, TH.bounces) == Surface.SIDE_GLASS
    assert nearest_surface_2d(kink_at(0.1, 10.0), PLAN, COURT, TH.bounces) == Surface.FENCE
    assert nearest_surface_2d(kink_at(5.0, 6.0), PLAN, COURT, TH.bounces) == Surface.FLOOR


def test_no_observations_no_bounces() -> None:
    assert _detect([]) == []


@pytest.mark.parametrize(("level", "f1"), [("low", 0.95), ("medium", 0.95), ("high", 0.90)])
def test_bounce_f1_at_100_ms_on_simulated_matches(level: str, f1: float) -> None:
    ev = measure_events(PROFILES[level], range(10))
    assert ev.bounces.tp + ev.bounces.fn >= 90
    assert ev.bounces.f1 >= f1
    assert ev.surface_ok >= 0.95 * ev.bounces.tp


def test_bounce_f1_at_the_analysis_rate_of_25_fps() -> None:
    low = measure_events(PROFILES["low"], range(10), fps=25.0)
    medium = measure_events(PROFILES["medium"], range(10), fps=25.0)
    assert low.bounces.f1 >= 0.92
    assert medium.bounces.f1 >= 0.85


@pytest.mark.parametrize("level", ["low", "medium", "high"])
def test_surface_accuracy_for_balls_sent_into_the_back_corners(level: str) -> None:
    c = measure_corners(PROFILES[level], range(60))
    assert c.detected >= 0.7 * c.contacts
    assert c.surface_ok >= 0.95 * c.detected


def test_with_one_camera_the_bounce_stage_is_a_weak_fallback() -> None:
    """Documented limit (docs/ml/algorithm-limits.md): the test pins the measured weakness."""
    ev = measure_events(PROFILES["medium"], range(10), cameras="A")
    assert ev.bounces.f1 < 0.5
    assert np.isfinite(ev.bounces.f1)


def test_the_velocity_direction_helps_in_the_corners_when_the_noise_is_high() -> None:
    smart = measure_corners(PROFILES["high"], range(60))
    naive_rate = smart.surface_ok_position_only / smart.detected_position_only
    assert smart.surface_ok / smart.detected > naive_rate + 0.02
