"""The simulator is the ground truth of the geometry tests: check that it is physical."""

from __future__ import annotations

import math
import random

import numpy as np
from sim.camera import make_camera
from sim.measure import plan, rally, thresholds
from sim.physics import DT, BallState, net_height, step
from sim.rally import make_corner_shot

from ml.schemas import Surface


def _fly(state: BallState, seconds: float) -> BallState:
    while state.t < seconds:
        step(state, plan())
    return state


def test_a_dropped_ball_bounces_on_the_floor_with_the_floor_restitution() -> None:
    state = BallState(t=0.0, p=(5.0, 5.0, 1.5), v=(0.0, 0.0, 0.0))
    _fly(state, 1.0)
    floor = [c for c in state.contacts if c.surface == Surface.FLOOR]
    assert floor
    speed_in = floor[0].normal_speed_in
    assert math.isclose(speed_in, math.sqrt(2 * 9.81 * 1.5), rel_tol=0.05)
    # Rebound height follows e^2 times the drop height.
    heights = []
    state = BallState(t=0.0, p=(5.0, 5.0, 1.5), v=(0.0, 0.0, 0.0))
    while state.t < 1.5:
        step(state, plan())
        heights.append(state.p[2])
    rise = max(heights[int(0.7 / DT) : int(1.3 / DT)])
    assert 0.5 < rise < 1.1


def test_the_ball_reflects_on_back_glass_side_glass_and_fence() -> None:
    cases = {
        Surface.BACK_GLASS: ((5.0, 3.0, 2.0), (0.0, -12.0, 1.0)),
        Surface.SIDE_GLASS: ((3.0, 2.0, 2.0), (-12.0, 0.0, 1.0)),
        Surface.FENCE: ((3.0, 10.0, 1.5), (-12.0, 0.0, 1.0)),
    }
    for surface, (position, velocity) in cases.items():
        state = BallState(t=0.0, p=position, v=velocity)
        _fly(state, 0.8)
        assert surface in {c.surface for c in state.contacts}, surface


def test_the_ball_stops_at_the_net_when_it_hits_below_the_top() -> None:
    state = BallState(t=0.0, p=(5.0, 7.0, 0.6), v=(0.0, 15.0, 0.5))
    _fly(state, 0.6)
    assert state.contacts[0].surface == Surface.NET
    assert state.p[1] < 10.5
    assert net_height(5.0) == 0.88
    assert net_height(0.0) == 0.92


def test_the_ball_goes_over_the_net_above_its_top() -> None:
    state = BallState(t=0.0, p=(5.0, 7.0, 2.0), v=(0.0, 15.0, 0.0))
    _fly(state, 0.5)
    assert state.p[1] > 10.0
    assert all(c.surface != Surface.NET for c in state.contacts)


def test_drag_slows_the_ball_down() -> None:
    state = BallState(t=0.0, p=(5.0, 2.0, 4.0), v=(0.0, 25.0, 0.0))
    _fly(state, 0.3)
    assert math.hypot(state.v[0], state.v[1]) < 25.0 - 1.0


def test_a_ball_above_the_wall_leaves_the_court() -> None:
    state = BallState(t=0.0, p=(5.0, 3.0, 6.0), v=(0.0, -15.0, 3.0))
    _fly(state, 0.5)
    assert state.dead


def test_rallies_are_reproducible_and_have_every_kind_of_event() -> None:
    first, second = rally(0), rally(0)
    assert np.array_equal(first.positions, second.positions)
    kinds = {c.surface for seed in range(8) for c in rally(seed).contacts}
    assert {Surface.FLOOR, Surface.BACK_GLASS, Surface.FENCE} <= kinds
    assert all(len(rally(seed).hits) >= 3 for seed in range(8))


def test_the_ball_stays_inside_the_court_volume() -> None:
    for seed in range(5):
        pos = rally(seed).positions
        assert pos[:, 0].min() >= 0.0
        assert pos[:, 0].max() <= 10.0
        assert pos[:, 1].min() >= 0.0
        assert pos[:, 1].max() <= 20.0
        assert pos[:, 2].min() >= 0.03


def test_hits_put_the_wrist_on_the_ball() -> None:
    rl = rally(1)
    for hit in rl.hits:
        wrist = np.array(rl.wrist_at(hit.player, hit.time_s))
        assert np.linalg.norm(wrist - np.array(hit.ball)) < 0.45


def test_corner_shots_reach_a_back_wall() -> None:
    plan_ = plan()
    for seed in range(5):
        shot = make_corner_shot(random.Random(seed), plan_)
        assert any(c.surface == Surface.BACK_GLASS for c in shot.contacts)


def test_the_ground_truth_cutoffs_match_the_thresholds_file() -> None:
    from sim.rally import MIN_GT_NORMAL_CHANGE
    from sim.scoring import RESOLUTION_S

    th = thresholds()
    assert th.bounces.min_normal_speed_change_mps == MIN_GT_NORMAL_CHANGE
    assert th.bounces.min_separation_ms == RESOLUTION_S * 1000


def test_cameras_sit_behind_the_glass_tilted_down_and_see_the_whole_floor() -> None:
    th = thresholds()
    for name, y in (("A", -3.0), ("B", 23.0)):
        cam = make_camera(name, th.court)
        assert cam.position.tolist() == [5.0, y, 6.0]
        floor = np.array([[x, yy, 0.0] for x in (0.0, 5.0, 10.0) for yy in (0.0, 10.0, 20.0)])
        _, inside = cam.visible(floor)
        assert inside.all()
        forward = cam.rotation[2]
        assert math.isclose(math.degrees(math.asin(-forward[2])), 35.0, abs_tol=1e-6)
