"""The padel court: reference points, walls and the per-court glass-and-fence plan.

Coordinates are metres with the origin at the side-A corner: x across the width, y along the
length (the net is at ``net_y_m``), z up. Camera A looks from y < 0, camera B from y > length.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

import numpy as np
from numpy.typing import NDArray
from pydantic import BaseModel, ConfigDict

from ml.geometry.consts import HALF
from ml.schemas import Surface
from ml.thresholds import CourtGeometry

FloatArray = NDArray[np.float64]


class Plane(StrEnum):
    """The four vertical walls around the court."""

    BACK_A = "back_a"  # y = 0
    BACK_B = "back_b"  # y = length
    SIDE_LEFT = "side_left"  # x = 0
    SIDE_RIGHT = "side_right"  # x = width


class WallSegment(BaseModel):
    """A stretch of one wall made of a single material, between two heights."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    plane: Plane
    along_from_m: float
    along_to_m: float
    z_from_m: float
    z_to_m: float
    surface: Surface


class SurfacePlan(BaseModel):
    """Which parts of the walls are glass and which are fence, loaded per court at install."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    segments: tuple[WallSegment, ...]

    def surface_at(self, plane: Plane, along_m: float, z_m: float) -> Surface | None:
        """Surface at a point of a wall, or None above the wall (the ball left the court)."""
        for seg in self.segments:
            if (
                seg.plane == plane
                and seg.along_from_m <= along_m <= seg.along_to_m
                and seg.z_from_m <= z_m <= seg.z_to_m
            ):
                return seg.surface
        return None


def default_surface_plan(court: CourtGeometry) -> SurfacePlan:
    """Glass up to the glass height, fence up to the wall height; side centres are all fence."""
    segments: list[WallSegment] = []
    for plane in (Plane.BACK_A, Plane.BACK_B):
        segments.append(
            WallSegment(
                plane=plane,
                along_from_m=0.0,
                along_to_m=court.width_m,
                z_from_m=0.0,
                z_to_m=court.back_glass_height_m,
                surface=Surface.BACK_GLASS,
            )
        )
        segments.append(
            WallSegment(
                plane=plane,
                along_from_m=0.0,
                along_to_m=court.width_m,
                z_from_m=court.back_glass_height_m,
                z_to_m=court.wall_height_m,
                surface=Surface.FENCE,
            )
        )
    glass_spans = (
        (0.0, court.side_glass_from_back_m),
        (court.length_m - court.side_glass_from_back_m, court.length_m),
    )
    for plane in (Plane.SIDE_LEFT, Plane.SIDE_RIGHT):
        for start, end in glass_spans:
            segments.append(
                WallSegment(
                    plane=plane,
                    along_from_m=start,
                    along_to_m=end,
                    z_from_m=0.0,
                    z_to_m=court.back_glass_height_m,
                    surface=Surface.SIDE_GLASS,
                )
            )
            segments.append(
                WallSegment(
                    plane=plane,
                    along_from_m=start,
                    along_to_m=end,
                    z_from_m=court.back_glass_height_m,
                    z_to_m=court.wall_height_m,
                    surface=Surface.FENCE,
                )
            )
        segments.append(
            WallSegment(
                plane=plane,
                along_from_m=court.side_glass_from_back_m,
                along_to_m=court.length_m - court.side_glass_from_back_m,
                z_from_m=0.0,
                z_to_m=court.wall_height_m,
                surface=Surface.FENCE,
            )
        )
    return SurfacePlan(segments=tuple(segments))


@dataclass(frozen=True)
class WallGeometry:
    """Plane equation of one wall: ``normal . p == offset``, normal pointing into the court."""

    plane: Plane
    normal: FloatArray
    offset_m: float


def wall_geometries(court: CourtGeometry) -> tuple[WallGeometry, ...]:
    """The four walls with their inward normals."""
    return (
        WallGeometry(Plane.BACK_A, np.array([0.0, 1.0, 0.0]), 0.0),
        WallGeometry(Plane.BACK_B, np.array([0.0, -1.0, 0.0]), -court.length_m),
        WallGeometry(Plane.SIDE_LEFT, np.array([1.0, 0.0, 0.0]), 0.0),
        WallGeometry(Plane.SIDE_RIGHT, np.array([-1.0, 0.0, 0.0]), -court.width_m),
    )


def along_coordinate(plane: Plane, x_m: float, y_m: float) -> float:
    """Distance along the wall: x for the back walls, y for the side walls."""
    return x_m if plane in (Plane.BACK_A, Plane.BACK_B) else y_m


def reference_points(court: CourtGeometry) -> FloatArray:
    """The 12 known floor points the installer marks, as (12, 2) metres.

    4 corners, 4 service-line ends on the side walls, 2 service-line/centre-line crossings and
    the 2 net posts at floor level.
    """
    xs = (0.0, court.width_m)
    near = court.net_y_m - court.service_line_from_net_m
    far = court.net_y_m + court.service_line_from_net_m
    centre = court.width_m * HALF
    points: list[tuple[float, float]] = []
    for y in (0.0, court.length_m, near, far, court.net_y_m):
        points.extend((x, y) for x in xs)
    points.extend([(centre, near), (centre, far)])
    return np.array(points, dtype=np.float64)


def net_height_at(court: CourtGeometry, x_m: float) -> float:
    """Net height at a given x: lowest in the centre, highest at the posts."""
    centre = court.width_m * HALF
    share = abs(x_m - centre) / centre
    share = min(share, 1.0)
    return court.net_height_center_m + share * (
        court.net_height_posts_m - court.net_height_center_m
    )
