"""Issue #127: shot detection from the 3D ball track and the players' wrists."""

from __future__ import annotations

import math

import numpy as np
import pytest
from sim.camera import PROFILES
from sim.measure import measure_events, thresholds
from sim.synthetic import Leg, chain, leg_end, leg_end_velocity, observations

from ml.events.bounces import detect_bounces
from ml.events.records import WristSample
from ml.events.shots import detect_shots
from ml.geometry.court import default_surface_plan
from ml.schemas import BallObservation, ShotEvent, Surface

TH = thresholds()
PLAN = default_surface_plan(TH.court)
FPS = 60.0
HIT_S = 0.5  # the hit happens half a second into the synthetic flights
START = (5.0, 4.0, 1.4)


def _velocity(
    speed: float, azimuth_deg: float, elevation_deg: float = 5.0
) -> tuple[float, float, float]:
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    return (
        speed * math.cos(el) * math.sin(az),
        speed * math.cos(el) * math.cos(az),
        speed * math.sin(el),
    )


def _two_legs(
    first: tuple[float, float, float], second: tuple[float, float, float], fps: float = FPS
) -> tuple[list[BallObservation], tuple[float, float, float]]:
    legs = chain(START, [(first, HIT_S), (second, 0.6)])
    return observations(legs, fps), leg_end(legs[0])


def _wrists(
    hit: tuple[float, float, float],
    offset_m: float = 0.3,
    owner: int = 1,
    fps: float = FPS,
    duration_s: float = 1.1,
    others: tuple[float, float, float] = (9.0, 18.0, 1.0),
) -> list[WristSample]:
    samples: list[WristSample] = []
    for k in range(int(duration_s * fps)):
        for player in range(4):
            x, y, z = (hit[0] + offset_m, hit[1], hit[2]) if player == owner else others
            samples.append(
                WristSample(
                    time_ms=round(k / fps * 1000),
                    track_id=player,
                    x_m=x,
                    y_m=y,
                    z_m=z,
                    foot_x_m=x,
                    foot_y_m=y,
                )
            )
    return samples


def _detect(obs: list[BallObservation], wrists: list[WristSample]) -> list[ShotEvent]:
    return detect_shots(obs, wrists, PLAN, TH)


def test_a_ball_that_comes_back_the_other_way_next_to_a_wrist_is_a_shot() -> None:
    obs, hit = _two_legs(_velocity(15, 0), _velocity(18, 180, 12))
    shots = _detect(obs, _wrists(hit))
    assert len(shots) == 1
    shot = shots[0]
    assert shot.track_id == 1
    assert abs(shot.time_ms - HIT_S * 1000) <= 20
    assert shot.ball_position.z_m is not None
    assert (shot.ball_position.x_m, shot.ball_position.y_m) == pytest.approx(hit[:2], abs=0.15)


def _turned(yaw_deg: float) -> tuple[list[BallObservation], tuple[float, float, float], float]:
    """Flight that turns by ``yaw_deg`` in the horizontal plane; also returns the 3D angle."""
    first = Leg(START, _velocity(15, 0, 0), HIT_S)
    vx, vy, vz = leg_end_velocity(first)
    yaw = math.radians(yaw_deg)
    after = (vx * math.cos(yaw) + vy * math.sin(yaw), -vx * math.sin(yaw) + vy * math.cos(yaw), vz)
    cosine = (vx * after[0] + vy * after[1] + vz * after[2]) / (
        math.sqrt(vx**2 + vy**2 + vz**2) * math.sqrt(sum(c * c for c in after))
    )
    legs = [first, Leg(leg_end(first), after, 0.6)]
    return observations(legs, FPS), leg_end(first), math.degrees(math.acos(cosine))


@pytest.mark.parametrize("yaw", [20.0, 30.0, 45.0, 90.0, 150.0])
def test_the_direction_change_must_pass_the_threshold(yaw: float) -> None:
    assert TH.shots.min_direction_change_deg == 35.0
    obs, hit, angle = _turned(yaw)
    shots = _detect(obs, _wrists(hit))
    if angle < 30.0:
        assert shots == []
    elif angle > 40.0:
        assert len(shots) == 1


@pytest.mark.parametrize(("after_speed", "is_shot"), [(14.0, False), (6.0, True), (28.0, True)])
def test_an_abrupt_change_of_speed_without_turning_is_a_shot(
    after_speed: float, is_shot: bool
) -> None:
    obs, hit = _two_legs(_velocity(15, 0, 3), _velocity(after_speed, 0, 3))
    assert bool(_detect(obs, _wrists(hit))) is is_shot


@pytest.mark.parametrize(
    ("distance_m", "is_shot"), [(0.3, True), (1.0, True), (1.4, False), (3.0, False)]
)
def test_the_wrist_must_be_within_reach(distance_m: float, is_shot: bool) -> None:
    assert TH.shots.max_wrist_distance_m == 1.2
    obs, hit = _two_legs(_velocity(15, 0), _velocity(15, 120))
    assert bool(_detect(obs, _wrists(hit, offset_m=distance_m))) is is_shot


def test_the_shot_goes_to_the_player_with_the_closest_wrist() -> None:
    obs, hit = _two_legs(_velocity(15, 0), _velocity(15, 120))
    samples = _wrists(hit, offset_m=0.9, owner=2) + _wrists(hit, offset_m=0.35, owner=3)
    shots = _detect(obs, samples)
    assert [s.track_id for s in shots] == [3]


def test_the_shot_reports_where_the_player_stood() -> None:
    obs, hit = _two_legs(_velocity(15, 0), _velocity(15, 120))
    samples = [
        s.model_copy(update={"foot_x_m": 3.0, "foot_y_m": 6.0}) if s.track_id == 1 else s
        for s in _wrists(hit)
    ]
    shot = _detect(obs, samples)[0]
    assert (shot.player_position.x_m, shot.player_position.y_m) == (3.0, 6.0)
    assert 0.0 <= shot.confidence <= 1.0


def test_a_lob_that_only_follows_gravity_has_no_shots() -> None:
    legs = chain((5.0, 3.0, 1.0), [((0.5, 6.0, 12.0), 2.4)])
    obs = observations(legs, FPS, noise_m=0.01)
    samples = _wrists((5.0, 3.0, 1.0), duration_s=2.4)
    assert _detect(obs, samples) == []


def test_noise_in_the_positions_does_not_make_phantom_shots() -> None:
    legs = chain((5.0, 3.0, 1.0), [((1.0, 12.0, 5.0), 1.2)])
    shots = []
    for seed in range(5):
        obs = observations(legs, FPS, noise_m=0.03, seed=seed)
        shots += _detect(obs, _wrists((5.0, 5.0, 2.0), duration_s=1.2))
    assert shots == []


def test_two_kinks_in_quick_succession_are_one_shot() -> None:
    legs = chain(
        START,
        [(_velocity(15, 0), 0.5), (_velocity(15, 90), 0.1), (_velocity(15, 180), 0.5)],
    )
    obs = observations(legs, FPS)
    shots = _detect(obs, _wrists(leg_end(legs[0]), duration_s=1.1))
    assert len(shots) == 1


def test_two_hits_far_apart_in_time_are_two_shots() -> None:
    legs = chain(
        START,
        [(_velocity(15, 0), 0.5), (_velocity(15, 90), 0.6), (_velocity(15, 180), 0.6)],
    )
    obs = observations(legs, FPS)
    first, second = leg_end(legs[0]), leg_end(legs[1])
    samples = [
        *_wrists(first, owner=0, duration_s=1.7),
        *_wrists(second, owner=2, duration_s=1.7),
    ]
    shots = _detect(obs, samples)
    assert sorted(s.track_id for s in shots) == [0, 2]


def test_a_wrist_has_to_be_there_at_the_time_of_the_shot() -> None:
    obs, hit = _two_legs(_velocity(15, 0), _velocity(15, 120))
    late = [s.model_copy(update={"time_ms": s.time_ms + 700}) for s in _wrists(hit)]
    assert _detect(obs, late) == []
    assert _detect(obs, []) == []


def test_a_bounce_on_the_floor_next_to_a_player_is_not_a_shot() -> None:
    fall_s = math.sqrt(2 * (2.0 - TH.court.ball_radius_m) / 9.81)
    drop = chain((5.0, 5.0, 2.0), [((0.0, 4.0, 0.0), fall_s)])
    end = leg_end(drop[0])
    assert end[2] < 0.1
    legs = [*drop, *chain(end, [((0.0, 3.2, 5.8), 0.9)])]
    obs = observations(legs, FPS)
    near_feet = _wrists((end[0], end[1], 0.4), duration_s=1.5)
    assert _detect(obs, near_feet) == []
    assert [b.surface for b in detect_bounces(obs, PLAN, TH)] == [Surface.FLOOR]


def test_a_rebound_off_the_back_glass_next_to_a_player_is_not_a_shot() -> None:
    wall_y = TH.court.length_m - TH.court.ball_radius_m
    t_hit = (wall_y - 15.0) / 12.0
    legs = chain((5.0, 15.0, 1.6), [((0.0, 12.0, 1.0), t_hit), ((0.0, -9.6, 1.0), 0.7)])
    obs = observations(legs, FPS)
    near_wall = _wrists((5.0, wall_y - 0.5, 1.4), duration_s=1.5)
    assert _detect(obs, near_wall) == []
    assert [b.surface for b in detect_bounces(obs, PLAN, TH)] == [Surface.BACK_GLASS]


def test_shots_still_work_when_only_the_floor_position_is_known() -> None:
    legs = chain(START, [(_velocity(15, 0, 0), 0.5), (_velocity(15, 120, 0), 0.6)])
    obs = observations(legs, FPS, with_height=False)
    shots = detect_shots(
        obs, [s.model_copy(update={"z_m": None}) for s in _wrists(leg_end(legs[0]))], PLAN, TH
    )
    assert len(shots) == 1
    assert shots[0].ball_position.z_m is None


def test_a_track_that_is_too_short_has_no_events() -> None:
    legs = [Leg(START, _velocity(15, 0), 0.05)]
    obs = observations(legs, FPS)
    assert _detect(obs, _wrists(START)) == []
    assert _detect([], _wrists(START)) == []


@pytest.mark.parametrize(("level", "f1"), [("low", 0.93), ("medium", 0.90), ("high", 0.85)])
def test_shot_f1_at_100_ms_on_simulated_matches(level: str, f1: float) -> None:
    ev = measure_events(PROFILES[level], range(10))
    assert ev.shots.tp + ev.shots.fn >= 90
    assert ev.shots.f1 >= f1
    assert ev.attributed >= 0.97 * ev.shots.tp


def test_shot_f1_at_the_analysis_rate_of_25_fps() -> None:
    low = measure_events(PROFILES["low"], range(10), fps=25.0)
    medium = measure_events(PROFILES["medium"], range(10), fps=25.0)
    assert low.shots.f1 >= 0.92
    assert medium.shots.f1 >= 0.85


def test_shot_detection_does_not_need_the_wrist_height() -> None:
    ev = measure_events(PROFILES["medium"], range(10), wrist_height=False)
    assert ev.shots.f1 >= 0.88


def test_with_one_camera_the_floor_projection_is_not_enough_to_find_shots() -> None:
    """Documented limit (docs/ml/algorithm-limits.md): the test pins the measured weakness."""
    ev = measure_events(PROFILES["medium"], range(10), cameras="A")
    assert ev.shots.f1 < 0.5
    assert np.isfinite(ev.shots.f1)
