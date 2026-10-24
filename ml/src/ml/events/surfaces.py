"""Which surface did the ball touch? (spec 5.8, issue #128)

A kink of the ball track is a contact with a surface when it happens on the surface and the
velocity changes along that surface's normal. Position alone cannot tell the back glass from
the side glass near a corner, or a floor bounce from a ball skimming past a wall seen from
behind, so the direction of the velocity change decides between the planes that are close.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ml.events.kinematics import F64, Kink
from ml.geometry.consts import HALF, THREE, TWO
from ml.geometry.court import Plane, SurfacePlan, along_coordinate, net_height_at, wall_geometries
from ml.schemas import CourtSide, Surface
from ml.thresholds import BounceThresholds, CourtGeometry

FLOOR_NORMAL = np.array([0.0, 0.0, 1.0])
NET_NORMAL = np.array([0.0, 1.0, 0.0])


@dataclass(frozen=True)
class SurfaceContact:
    """A kink explained by a surface."""

    surface: Surface
    side: CourtSide
    distance_m: float
    alignment: float
    normal_speed_change: float


def _candidates(
    kink: Kink, court: CourtGeometry, plan: SurfacePlan, th: BounceThresholds
) -> list[tuple[Surface, float, F64]]:
    """(surface, distance to the ball-centre contact plane, normal) of every plane in reach."""
    p = kink.position
    r = court.ball_radius_m
    found: list[tuple[Surface, float, F64]] = []
    height = float(p[TWO])
    floor_distance = height - r
    if abs(floor_distance) <= th.floor_tolerance_m:
        found.append((Surface.FLOOR, abs(floor_distance), FLOOR_NORMAL))
    for wall in wall_geometries(court):
        distance = float(np.dot(wall.normal, p) - wall.offset_m) - r
        if abs(distance) > th.surface_tolerance_m:
            continue
        along = along_coordinate(wall.plane, float(p[0]), float(p[1]))
        extent = court.width_m if wall.plane in (Plane.BACK_A, Plane.BACK_B) else court.length_m
        surface = plan.surface_at(wall.plane, min(max(along, 0.0), extent), max(height, 0.0))
        if surface is not None:
            found.append((surface, abs(distance), wall.normal))
    net_distance = abs(float(p[1]) - court.net_y_m) - r
    if abs(net_distance) <= th.surface_tolerance_m and height <= (
        net_height_at(court, float(p[0])) + th.net_height_margin_m
    ):
        found.append((Surface.NET, abs(net_distance), NET_NORMAL))
    return found


def classify_kink(
    kink: Kink,
    plan: SurfacePlan,
    court: CourtGeometry,
    th: BounceThresholds,
    *,
    use_velocity_direction: bool = True,
) -> SurfaceContact | None:
    """The surface a 3D kink belongs to, or None if it is not a contact.

    With ``use_velocity_direction`` (the default) the plane is the one whose normal is best
    aligned with the velocity change; with it off, the nearest plane by position wins (kept to
    measure how much the direction helps).
    """
    if kink.dims != THREE:
        return None
    delta = kink.delta_v
    size = float(np.linalg.norm(delta))
    if size == 0.0:
        return None
    best: tuple[float, SurfaceContact] | None = None
    for surface, distance, normal in _candidates(kink, court, plan, th):
        normal_change = abs(float(np.dot(delta, normal)))
        alignment = normal_change / size
        if use_velocity_direction:
            if (
                normal_change < th.min_normal_speed_change_mps
                or alignment < th.min_normal_alignment
            ):
                continue
        elif size < th.min_normal_speed_change_mps:
            continue  # position only: any strong enough kink on a surface counts
        contact = SurfaceContact(
            surface,
            CourtSide.A if float(kink.position[1]) < court.net_y_m else CourtSide.B,
            distance,
            alignment,
            normal_change,
        )
        key = alignment if use_velocity_direction else -distance
        if best is None or key > best[0]:
            best = (key, contact)
    return None if best is None else best[1]


def nearest_surface_2d(
    kink: Kink, plan: SurfacePlan, court: CourtGeometry, th: BounceThresholds
) -> Surface:
    """Single-camera fallback: surface from the apparent floor position alone."""
    x, y = float(kink.position[0]), float(kink.position[1])
    gaps = {
        Plane.BACK_A: y,
        Plane.BACK_B: court.length_m - y,
        Plane.SIDE_LEFT: x,
        Plane.SIDE_RIGHT: court.width_m - x,
    }
    plane = min(gaps, key=lambda k: abs(gaps[k]))
    if abs(gaps[plane]) > th.surface_tolerance_m:
        return Surface.FLOOR
    along = along_coordinate(plane, x, y)
    surface = plan.surface_at(plane, along, court.back_glass_height_m * HALF)
    return surface if surface is not None else Surface.FLOOR
