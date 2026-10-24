"""Padel ball physics for the simulator: gravity, quadratic drag, bounces with restitution.

Court 10 x 20 m, net 0.88 m in the centre and 0.92 m at the posts. Floor, glass, fence and net
have their own restitution coefficients. This module is test code on purpose: it is the ground
truth the algorithms are measured against and must never share code paths with them.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from ml.geometry.court import Plane, SurfacePlan, along_coordinate
from ml.schemas import Surface

GRAVITY = 9.81
# 0.5 * air density * drag coefficient * cross-section / mass for a 57 g, 6.7 cm ball.
DRAG_K = 0.0204
BALL_RADIUS = 0.0335
DT = 1.0 / 480.0
COURT_W = 10.0
COURT_L = 20.0
NET_Y = 10.0
NET_CENTRE = 0.88
NET_POST = 0.92
WALL_TOP = 4.0


@dataclass(frozen=True)
class Material:
    normal: float  # restitution along the normal
    tangent: float  # share of tangential speed kept


MATERIALS = {
    Surface.FLOOR: Material(0.76, 0.82),
    Surface.BACK_GLASS: Material(0.80, 0.88),
    Surface.SIDE_GLASS: Material(0.80, 0.88),
    Surface.FENCE: Material(0.45, 0.70),
    Surface.NET: Material(0.05, 0.25),
}


def net_height(x: float) -> float:
    share = min(abs(x - COURT_W / 2.0) / (COURT_W / 2.0), 1.0)
    return NET_CENTRE + share * (NET_POST - NET_CENTRE)


@dataclass(frozen=True)
class Contact:
    """A ground-truth bounce: when, where, on what, and how hard it hit."""

    time_s: float
    position: tuple[float, float, float]
    surface: Surface
    normal_speed_in: float

    @property
    def normal_speed_change(self) -> float:
        """Change of the velocity along the normal: what a detector can measure."""
        return (1.0 + MATERIALS[self.surface].normal) * self.normal_speed_in


@dataclass
class BallState:
    t: float
    p: tuple[float, float, float]
    v: tuple[float, float, float]
    floor_contacts: int = 0
    wall_contacts: int = 0
    side_of_first_floor: int = 0  # +1 if the first floor contact was at y > net
    apex_passed: bool = False
    dead: bool = False
    contacts: list[Contact] = field(default_factory=list)


def _accel(v: tuple[float, float, float]) -> tuple[float, float, float]:
    speed = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
    return (-DRAG_K * speed * v[0], -DRAG_K * speed * v[1], -GRAVITY - DRAG_K * speed * v[2])


def _bounce(
    v: tuple[float, float, float], normal: tuple[float, float, float], mat: Material
) -> tuple[float, float, float]:
    vn = v[0] * normal[0] + v[1] * normal[1] + v[2] * normal[2]
    tang = (v[0] - vn * normal[0], v[1] - vn * normal[1], v[2] - vn * normal[2])
    return (
        mat.tangent * tang[0] - mat.normal * vn * normal[0],
        mat.tangent * tang[1] - mat.normal * vn * normal[1],
        mat.tangent * tang[2] - mat.normal * vn * normal[2],
    )


def step(state: BallState, plan: SurfacePlan) -> None:
    """Advance one DT with semi-implicit Euler and resolve at most one contact."""
    ax, ay, az = _accel(state.v)
    vx, vy, vz = state.v[0] + ax * DT, state.v[1] + ay * DT, state.v[2] + az * DT
    x, y, z = state.p[0] + vx * DT, state.p[1] + vy * DT, state.p[2] + vz * DT
    t = state.t + DT
    r = BALL_RADIUS
    if state.v[2] > 0.0 >= vz:
        state.apex_passed = True
    # Net: the ball centre crosses y = NET_Y below the net top.
    if (state.p[1] - NET_Y) * (y - NET_Y) < 0.0 and z < net_height(x) + r:
        speed_in = abs(vy)
        state.contacts.append(Contact(t, (x, NET_Y, z), Surface.NET, speed_in))
        vx, vy, vz = _bounce(
            (vx, vy, vz), (0.0, 1.0 if vy < 0 else -1.0, 0.0), MATERIALS[Surface.NET]
        )
        y = NET_Y + (r if vy > 0 else -r)
        state.wall_contacts += 1
    contact_plane: tuple[Plane, tuple[float, float, float]] | None = None
    if y < r:
        contact_plane = (Plane.BACK_A, (0.0, 1.0, 0.0))
    elif y > COURT_L - r:
        contact_plane = (Plane.BACK_B, (0.0, -1.0, 0.0))
    elif x < r:
        contact_plane = (Plane.SIDE_LEFT, (1.0, 0.0, 0.0))
    elif x > COURT_W - r:
        contact_plane = (Plane.SIDE_RIGHT, (-1.0, 0.0, 0.0))
    if contact_plane is not None:
        plane, normal = contact_plane
        surface = plan.surface_at(plane, along_coordinate(plane, x, y), z)
        if surface is None:
            state.dead = True  # left the court above the walls
        else:
            vn = vx * normal[0] + vy * normal[1] + vz * normal[2]
            if vn < 0.0:
                state.contacts.append(Contact(t, (x, y, z), surface, -vn))
                vx, vy, vz = _bounce((vx, vy, vz), normal, MATERIALS[surface])
                state.wall_contacts += 1
                x = min(max(x, r), COURT_W - r)
                y = min(max(y, r), COURT_L - r)
    if z < r and vz < 0.0:
        state.contacts.append(Contact(t, (x, y, r), Surface.FLOOR, -vz))
        vx, vy, vz = _bounce((vx, vy, vz), (0.0, 0.0, 1.0), MATERIALS[Surface.FLOOR])
        z = r
        if state.floor_contacts == 0:
            state.side_of_first_floor = 1 if y > NET_Y else -1
        state.floor_contacts += 1
        state.apex_passed = False
    state.t, state.p, state.v = t, (x, y, z), (vx, vy, vz)
