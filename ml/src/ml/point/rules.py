"""The rules the sources disagree on, as named options (see docs/ml/rules-ambiguities.md).

Every option has a default that follows spec section 6 literally. Changing an option changes
what the machine decides, never what it detects, so the owner can settle each one against the
official FIP rulebook without touching the algorithm.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict

from ml.point.events import BallSurface


class Fault(StrEnum):
    FAULT = "fault"
    LET = "let"


class LostAfterShot(StrEnum):
    """Rule 7 when the last valid event is a shot and the ball was never seen again."""

    HITTER_LOSES = "hitter_loses"
    HITTER_WINS = "hitter_wins"


class RuleOptions(BaseModel):
    """One field per ambiguity. A1 to A9 are the ids used in the ambiguities document."""

    model_config = ConfigDict(frozen=True)

    serve_net_contact: Fault = Fault.FAULT
    """A1: the serve touches the net and lands in the box. Spec: fault. FIP: a let."""
    serve_fault_walls: frozenset[BallSurface] = frozenset({BallSurface.FENCE})
    """A2: after a good serve bounce, hitting one of these before the return is a fault."""
    contrapared_valid: bool = True
    """A3: hitting your own wall before the ball crosses the net is allowed (spec)."""
    net_cord_valid_in_rally: bool = True
    """A4: in a rally, a ball that touches the net and still crosses is good."""
    wall_after_rival_floor_valid: bool = True
    """A5: after bouncing on the rival floor, touching a wall keeps the point alive."""
    lost_after_shot: LostAfterShot = LostAfterShot.HITTER_LOSES
    """A6: ball never seen again after a shot, before any bounce."""
    out_before_floor_loses_hitter: bool = True
    """A7: the ball leaves the court without bouncing on the rival floor."""
    receiver_hit_overrides_serve_fault: bool = True
    """A8: a "faulted" serve that the receiver then hit was probably a good one."""
    serve_without_bounce_is_good: bool = True
    """A9: the receiver hit the serve and no bounce was seen: assume a good bounce."""
    open_point_without_serve_flag: bool = False
    """A10: a shot that is not classified as a serve may open a point (spec: only a serve does)."""
