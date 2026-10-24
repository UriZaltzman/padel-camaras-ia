"""Input and output records of the point engine.

The engine reads the shots and bounces of spec sections 5.7 and 5.8, already reduced to what
the rules of section 6 need: who hit, on which side of the net, which surface the ball hit and
on which half. ``from_stage_events`` converts the typed stage records into this form.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import Field

from ml.labels import PointEndReason, Team
from ml.schemas import (
    BounceEvent,
    Confidence,
    CourtSide,
    NonNegativeInt,
    ShotEvent,
    ShotType,
    StageRecord,
    Surface,
)

Position = Annotated[int, Field(ge=1)]
"""Player position in the match, 1 to 4 (``match_players.position``)."""


class BallSurface(StrEnum):
    """Where the ball touched: the stage surfaces plus ``out`` (it left the court)."""

    FLOOR = "floor"
    BACK_GLASS = "back_glass"
    SIDE_GLASS = "side_glass"
    FENCE = "fence"
    NET = "net"
    OUT = "out"

    @property
    def is_wall(self) -> bool:
        return self in {BallSurface.BACK_GLASS, BallSurface.SIDE_GLASS, BallSurface.FENCE}


class ShotIn(StageRecord):
    """A shot: ``side`` is the half of the court where the hitter stood."""

    kind: Literal["shot"] = "shot"
    index: NonNegativeInt
    """Index in the stage's ``shots`` list; the contract refers to events by it."""
    time_ms: NonNegativeInt
    player: Position
    side: CourtSide
    confidence: Confidence
    is_serve: bool = False


class BounceIn(StageRecord):
    """A bounce on ``surface``; ``half`` is the half of the court it happened on."""

    kind: Literal["bounce"] = "bounce"
    index: NonNegativeInt
    time_ms: NonNegativeInt
    surface: BallSurface
    half: CourtSide
    confidence: Confidence
    in_service_box: bool | None = None
    """Whether a floor bounce is inside the cross service box; ``None`` when unknown."""


type RallyEvent = ShotIn | BounceIn


class EventRef(StageRecord):
    kind: Literal["shot", "bounce"]
    index: NonNegativeInt


class RawPoint(StageRecord):
    """A point as the state machine closed it, before any correction."""

    start_ms: NonNegativeInt
    end_ms: NonNegativeInt
    winner: Team
    reason: PointEndReason
    confidence: Confidence
    serve_faults: Annotated[int, Field(ge=0)]
    server_player: Position | None
    """Who the events say served; ``None`` when no serve shot was seen."""
    server_team: Team | None
    deciding_event: EventRef | None


def from_stage_events(
    shots: Sequence[ShotEvent],
    bounces: Sequence[BounceEvent],
    *,
    track_position: Mapping[int, int],
    net_y_m: float,
    out_of_play: Sequence[int] = (),
) -> list[RallyEvent]:
    """Convert stage records to engine events, sorted by time.

    ``track_position`` maps a tracker id to the player position. The hitter's side comes
    from where the hitter stood. Stage bounces never carry ``out``; ``out_of_play`` lists the
    indexes of bounces that the geometry stage found outside the court lines.
    """
    out: list[RallyEvent] = []
    for i, shot in enumerate(shots):
        side = CourtSide.A if shot.player_position.y_m < net_y_m else CourtSide.B
        out.append(
            ShotIn(
                index=i,
                time_ms=shot.time_ms,
                player=track_position[shot.track_id],
                side=side,
                confidence=shot.confidence,
                is_serve=shot.shot_type is ShotType.SERVE,
            )
        )
    lost = set(out_of_play)
    for i, bounce in enumerate(bounces):
        surface = BallSurface.OUT if i in lost else BallSurface(Surface(bounce.surface).value)
        out.append(
            BounceIn(
                index=i,
                time_ms=bounce.time_ms,
                surface=surface,
                half=bounce.side,
                confidence=bounce.confidence,
            )
        )
    out.sort(key=lambda e: (e.time_ms, e.kind != "shot"))
    return out
