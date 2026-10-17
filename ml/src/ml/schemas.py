"""Base typed records passed between pipeline stages (spec section 5).

Each stage is a pure function: it takes typed records from the previous stage and returns new
ones, which ``ml.parquet_io`` stores so any stage can be resumed or reprocessed. Positions are
in metres with the origin at the side-A corner of the court; times are in milliseconds from
the start of the recording.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

NonNegativeInt = Annotated[int, Field(ge=0)]
Confidence = Annotated[float, Field(ge=0.0, le=1.0)]


class StageRecord(BaseModel):
    """Base for every record a stage writes to Parquet: immutable and with no extra fields."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class Camera(StrEnum):
    A = "A"
    B = "B"


class CourtSide(StrEnum):
    """Half of the court: side A is y < net, side B is y > net."""

    A = "A"
    B = "B"


class Surface(StrEnum):
    """Where a bounce happened (spec section 5.8)."""

    FLOOR = "floor"
    BACK_GLASS = "back_glass"
    SIDE_GLASS = "side_glass"
    FENCE = "fence"
    NET = "net"


class ShotType(StrEnum):
    """The 10 classes of the shot-type classifier plus ``unknown`` (spec section 5.9)."""

    SERVE = "serve"
    FOREHAND = "forehand"
    BACKHAND = "backhand"
    FOREHAND_VOLLEY = "forehand_volley"
    BACKHAND_VOLLEY = "backhand_volley"
    BANDEJA = "bandeja"
    VIBORA = "vibora"
    SMASH = "smash"
    LOB = "lob"
    OFF_THE_WALL = "off_the_wall"
    UNKNOWN = "unknown"


class CourtPosition(StageRecord):
    """A point on the court floor, in metres."""

    x_m: float
    y_m: float


class BallPosition(StageRecord):
    """Ball position in metres. ``z_m`` is set only when both cameras triangulated it."""

    x_m: float
    y_m: float
    z_m: float | None = None


class PlayerDetection(StageRecord):
    """A person found by the detector in one frame (spec section 5.2)."""

    camera: Camera
    frame: NonNegativeInt
    time_ms: NonNegativeInt
    confidence: Confidence
    foot: CourtPosition


class TrackedPlayer(PlayerDetection):
    """A detection assigned to one of the 4 player tracks (spec section 5.3)."""

    track_id: NonNegativeInt


class BallObservation(StageRecord):
    """Ball position in one frame, measured or filled in by the Kalman filter (section 5.5)."""

    frame: NonNegativeInt
    time_ms: NonNegativeInt
    confidence: Confidence
    position: BallPosition
    interpolated: bool = False


class ShotEvent(StageRecord):
    """A shot attributed to the nearest player (spec sections 5.7 and 5.9)."""

    time_ms: NonNegativeInt
    track_id: NonNegativeInt
    player_position: CourtPosition
    ball_position: BallPosition
    shot_type: ShotType = ShotType.UNKNOWN
    shot_type_confidence: Confidence | None = None
    confidence: Confidence


class BounceEvent(StageRecord):
    """A bounce and the surface it hit (spec section 5.8)."""

    time_ms: NonNegativeInt
    surface: Surface
    position: BallPosition
    side: CourtSide
    confidence: Confidence
