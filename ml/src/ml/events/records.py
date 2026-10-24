"""Inputs of the event stages that do not come from the ball track."""

from __future__ import annotations

from ml.ball.records import PixelCoordinate
from ml.schemas import NonNegativeInt, StageRecord


class WristSample(StageRecord):
    """Dominant wrist of one tracked player at one instant, in court metres.

    ``z_m`` is the wrist height when pose was triangulated from both cameras, else None.
    ``foot_*`` is the player's position on the floor, reported with the shot.
    """

    time_ms: NonNegativeInt
    track_id: NonNegativeInt
    x_m: PixelCoordinate
    y_m: PixelCoordinate
    z_m: PixelCoordinate | None = None
    foot_x_m: PixelCoordinate
    foot_y_m: PixelCoordinate
