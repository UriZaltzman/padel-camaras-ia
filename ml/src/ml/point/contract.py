"""Scored points in the shape of the match-results contract (``ResultPoint``)."""

from __future__ import annotations

from typing import Any

from ml.labels import PointEndReason
from ml.point.pipeline import ScoredPoint

CONTRACT_END_REASON: dict[PointEndReason, str] = {
    PointEndReason.DOUBLE_FAULT: "double_fault",
    PointEndReason.OWN_FLOOR: "own_floor_before_net",
    PointEndReason.NET: "net",
    PointEndReason.DIRECT_WALL: "rival_wall_before_floor",
    PointEndReason.DOUBLE_BOUNCE: "double_bounce",
    PointEndReason.OUT_OF_COURT: "out_after_bounce",
    PointEndReason.BALL_LOST: "ball_lost",
    PointEndReason.OTHER: "ball_lost",
}
"""The contract has no ``other``: a point the rules do not cover is a lost ball."""


def to_result_point(point: ScoredPoint) -> dict[str, Any]:
    """One entry of ``points`` in ``packages/contracts`` match results.

    Flagged points (``needs_review``) carry the confidence the app shows with the clip.
    """
    return {
        "number": point.number,
        "set": point.set_number,
        "game": point.game_number,
        "server_position": point.server_position,
        "serve_faults": point.serve_faults,
        "winner_team": int(point.winner.value),
        "end_reason": CONTRACT_END_REASON[point.reason],
        "deciding_event": (
            None
            if point.deciding_event is None or point.reason is PointEndReason.BALL_LOST
            else {"kind": point.deciding_event.kind, "index": point.deciding_event.index}
        ),
        "confidence": point.confidence,
        "needs_review": point.needs_review,
        "start_ms": point.start_ms,
        "end_ms": point.end_ms,
    }
