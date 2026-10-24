"""Rally generator: four players hit the ball back and forth under the real physics."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

from ml.geometry.court import SurfacePlan
from ml.schemas import Surface
from sim.physics import (
    BALL_RADIUS,
    COURT_L,
    COURT_W,
    DT,
    NET_Y,
    BallState,
    Contact,
    step,
)

F64 = NDArray[np.float64]
MAX_FLIGHT_S = 6.0
TAIL_S = 1.2
# Ground-truth bounces change the normal velocity by at least this much; softer ones are
# rolling, not events. Same cutoff as thresholds.bounces.min_normal_speed_change_mps
# (a test keeps both equal).
MIN_GT_NORMAL_CHANGE = 4.4


@dataclass(frozen=True)
class Hit:
    time_s: float
    player: int
    ball: tuple[float, float, float]
    wrist: tuple[float, float, float]


@dataclass
class Player:
    keys: list[tuple[float, float, float]] = field(default_factory=list)  # (t, x, y)
    hands: list[tuple[float, tuple[float, float, float]]] = field(default_factory=list)


@dataclass
class Rally:
    """Ground truth of one rally: dense ball track, hits, bounces and the players' motion."""

    times: F64
    positions: F64  # (N, 3)
    velocities: F64
    hits: list[Hit]
    contacts: list[Contact]
    players: list[Player]
    plan: SurfacePlan

    @property
    def duration_s(self) -> float:
        return float(self.times[-1])

    def ball_at(self, t: F64) -> F64:
        return np.column_stack([np.interp(t, self.times, self.positions[:, k]) for k in range(3)])

    def foot_at(self, player: int, t: float) -> tuple[float, float]:
        keys = self.players[player].keys
        ts = [k[0] for k in keys]
        if t <= ts[0]:
            return keys[0][1], keys[0][2]
        if t >= ts[-1]:
            return keys[-1][1], keys[-1][2]
        i = int(np.searchsorted(ts, t)) - 1
        (t0, x0, y0), (t1, x1, y1) = keys[i], keys[i + 1]
        u = (t - t0) / (t1 - t0)
        s = u * u * (3.0 - 2.0 * u)
        return x0 + (x1 - x0) * s, y0 + (y1 - y0) * s

    def wrist_at(self, player: int, t: float) -> tuple[float, float, float]:
        """Dominant wrist: follows the body, and reaches the ball around each hit."""
        fx, fy = self.foot_at(player, t)
        sway = 0.12 * math.sin(2.3 * t + player)
        base = np.array([fx + 0.35 + sway, fy + 0.1, 1.0 + 0.1 * math.sin(3.1 * t + player)])
        for hit_t, pos in self.players[player].hands:
            w = math.exp(-(((t - hit_t) / 0.12) ** 2) / 2.0)
            if w > 1e-3:
                base = base + w * (np.array(pos) - base)
        return float(base[0]), float(base[1]), float(base[2])


def _launch(
    rng: random.Random, p: tuple[float, float, float], direction: int, overhead: bool
) -> tuple[float, float, float]:
    tx = rng.uniform(1.0, COURT_W - 1.0)
    ty = NET_Y + direction * rng.uniform(2.0, 9.0)
    az = math.atan2(ty - p[1], tx - p[0])
    kind = rng.random()
    if overhead:
        speed, el = rng.uniform(16.0, 30.0), math.radians(rng.uniform(-38.0, -12.0))
    elif kind < 0.2:
        speed, el = rng.uniform(11.0, 16.0), math.radians(rng.uniform(40.0, 62.0))
    else:
        speed, el = rng.uniform(10.0, 25.0), math.radians(rng.uniform(-3.0, 24.0))
    return (
        speed * math.cos(el) * math.cos(az),
        speed * math.cos(el) * math.sin(az),
        speed * math.sin(el),
    )


def _run_candidate(
    plan: SurfacePlan,
    t0: float,
    p0: tuple[float, float, float],
    v0: tuple[float, float, float],
    hitter_dir: int,
    mode: str,
    h_target: float,
) -> tuple[list[BallState], BallState | None]:
    """Fly the ball until the receiver can hit it. Returns the track and the hit state."""
    state = BallState(t=t0, p=p0, v=v0)
    track = [BallState(t=t0, p=p0, v=v0)]
    n_contacts = 0
    while state.t - t0 < MAX_FLIGHT_S:
        step(state, plan)
        track.append(BallState(t=state.t, p=state.p, v=state.v))
        new = state.contacts[n_contacts:]
        n_contacts = len(state.contacts)
        if state.dead or any(c.surface == Surface.NET for c in new):
            return track, None
        if (
            state.floor_contacts == 0
            and state.p[1] * hitter_dir < NET_Y * hitter_dir
            and (state.p[1] - NET_Y) * hitter_dir < -0.5
            and state.wall_contacts
            and state.t - t0 > 0.3
        ):
            return track, None  # bounced back on its own side
        if state.floor_contacts == 1 and state.side_of_first_floor != hitter_dir:
            return track, None  # first bounce on the hitter's own side
        if state.floor_contacts > 2:
            return track, None
        recv_dist = (state.p[1] - NET_Y) * hitter_dir
        in_recv = 1.2 < recv_dist < 9.5 and 0.4 < state.p[0] < COURT_W - 0.4
        descending = state.v[2] < 0.0
        if in_recv and descending and abs(state.p[2] - h_target) < 0.02:
            ok = (
                (mode == "volley" and state.floor_contacts == 0 and 1.5 < recv_dist < 7.0)
                or (mode == "bounce" and state.floor_contacts == 1 and state.wall_contacts == 0)
                or (mode == "wall" and state.floor_contacts >= 1 and state.wall_contacts >= 1)
            )
            if ok and state.apex_passed is False:
                return track, BallState(t=state.t, p=state.p, v=state.v)
            if ok:
                return track, BallState(t=state.t, p=state.p, v=state.v)
    return track, None


def make_rally(rng: random.Random, plan: SurfacePlan, max_shots: int = 14) -> Rally:
    """Simulate one rally with ``max_shots`` hits at most."""
    # players 0,1: side A (y < net), 2,3: side B. Even index = left of the court.
    homes = [(2.5, 2.5), (7.5, 2.5), (2.5, 17.5), (7.5, 17.5)]
    players = [Player(keys=[(0.0, hx, hy)]) for hx, hy in homes]
    server = rng.choice([0, 1])
    direction = 1
    hitter = server
    pos = (players[hitter].keys[0][1], players[hitter].keys[0][2], 1.05)
    t = 0.0
    track_t: list[float] = []
    track_p: list[tuple[float, float, float]] = []
    track_v: list[tuple[float, float, float]] = []
    hits: list[Hit] = []
    contacts: list[Contact] = []
    ball = pos
    for shot in range(max_shots):
        off = rng.uniform(0.1, 0.35)
        wrist = (ball[0] + off * math.cos(shot), ball[1] + off * math.sin(shot * 1.7), ball[2])
        hits.append(Hit(t, hitter, ball, wrist))
        players[hitter].hands.append((t, wrist))
        result: tuple[list[BallState], BallState | None] | None = None
        for _ in range(60):
            overhead = ball[2] > 1.6
            v0 = _launch(rng, ball, direction, overhead)
            mode = rng.choices(["bounce", "volley", "wall"], weights=[0.55, 0.25, 0.2])[0]
            h_target = rng.uniform(1.8, 2.3) if rng.random() < 0.2 else rng.uniform(0.8, 1.4)
            track, nxt = _run_candidate(plan, t, ball, v0, direction, mode, h_target)
            if nxt is not None:
                result = (track, nxt)
                break
        if result is None:
            # Free flight to the end: the ball is not returned.
            v0 = _launch(rng, ball, direction, False)
            st = BallState(t=t, p=ball, v=v0)
            while st.t - t < TAIL_S and not st.dead:
                step(st, plan)
                track_t.append(st.t)
                track_p.append(st.p)
                track_v.append(st.v)
            contacts.extend(st.contacts)
            break
        track, nxt = result
        assert nxt is not None
        # Re-run the committed candidate to collect its contacts (deterministic).
        st = BallState(t=t, p=ball, v=track[0].v)
        while st.t < nxt.t - DT / 2.0:
            step(st, plan)
            track_t.append(st.t)
            track_p.append(st.p)
            track_v.append(st.v)
        contacts.extend(st.contacts)
        t = st.t
        ball = st.p
        direction = -direction
        # Receiver: the player of the other side closest in x to the ball.
        side = [0, 1] if direction == 1 else [2, 3]
        hitter = side[0] if ball[0] < COURT_W / 2.0 else side[1]
        # Keyframes: everybody settles; the receiver arrives under the ball.
        for i, pl in enumerate(players):
            if i == hitter:
                pl.keys.append((t, ball[0] - 0.35, ball[1] - 0.1))
            else:
                hx, hy = homes[i]
                pl.keys.append((t, hx + rng.uniform(-1.0, 1.0), hy + rng.uniform(-1.0, 1.0)))
    times = np.array(track_t)
    pos_arr = np.array(track_p)
    vel_arr = np.array(track_v)
    keep = [c for c in contacts if c.normal_speed_change >= MIN_GT_NORMAL_CHANGE]
    return Rally(times, pos_arr, vel_arr, hits, keep, players, plan)


def foot_clamp(x: float, y: float) -> tuple[float, float]:
    return min(max(x, BALL_RADIUS), COURT_W - BALL_RADIUS), min(max(y, 0.0), COURT_L)


def make_corner_shot(rng: random.Random, plan: SurfacePlan) -> Rally:
    """One ball sent into a back corner: it touches the back glass and the side wall close by.

    This is the geometry where the back glass and the side glass are hardest to tell apart.
    """
    back = rng.choice([0.0, COURT_L])
    side = rng.choice([0.0, COURT_W])
    start_y = 7.0 if back == 0.0 else COURT_L - 7.0
    start = (rng.uniform(3.0, 7.0), start_y, rng.uniform(1.0, 1.6))
    target = (
        rng.uniform(0.3, 1.6) if side == 0.0 else COURT_W - rng.uniform(0.3, 1.6),
        back,
        rng.uniform(0.8, 2.4),
    )
    dx, dy, dz = (target[k] - start[k] for k in range(3))
    flat = math.hypot(dx, dy)
    speed = rng.uniform(13.0, 22.0)
    flight = flat / speed
    vz = dz / flight + 0.5 * 9.81 * flight
    v0 = (speed * dx / flat, speed * dy / flat, vz)
    st = BallState(t=0.0, p=start, v=v0)
    times, pos, vel = [st.t], [st.p], [st.v]
    while st.t < 3.5 and not st.dead:
        step(st, plan)
        times.append(st.t)
        pos.append(st.p)
        vel.append(st.v)
    keep = [c for c in st.contacts if c.normal_speed_change >= MIN_GT_NORMAL_CHANGE]
    players = [Player(keys=[(0.0, 2.0, 2.0)]) for _ in range(4)]
    return Rally(
        np.array(times),
        np.array(pos),
        np.array(vel),
        [Hit(0.0, 0, start, start)],
        keep,
        players,
        plan,
    )
