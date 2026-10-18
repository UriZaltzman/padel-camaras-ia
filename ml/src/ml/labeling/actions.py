"""Translate a shortcut pressed in the browser into a session change, and the session into JSON.

Kept apart from the HTTP server so it can be tested without a browser or a socket.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Annotated, Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ml.labeling.config import Action
from ml.labeling.session import LabelingSession
from ml.labels import PointEndReason, Team
from ml.schemas import ShotType, Surface
from ml.scoring import Score
from ml.thresholds import ScoringRules

PLAYBACK_ACTIONS = frozenset(
    {
        Action.PLAY_PAUSE,
        Action.SEEK_BACK,
        Action.SEEK_FORWARD,
        Action.SEEK_BACK_FINE,
        Action.SEEK_FORWARD_FINE,
        Action.CYCLE_RATE,
        Action.TOGGLE_MODE,
    }
)
"""Handled by the video element in the browser; they never reach the session."""


class Mode(StrEnum):
    """Which page the labeler is on: the timeline, the shot-type clips or the points."""

    TIMELINE = "timeline"
    SHOT_TYPE = "shot_type"
    POINTS = "points"


class ActionRequest(BaseModel):
    """What the page sends for a labeling shortcut: the action and the playhead time."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    action: Action
    time_ms: Annotated[int, Field(ge=0)]
    track_id: Annotated[int, Field(ge=0)] | None = None
    surface: Surface | None = None
    event_id: UUID | None = None
    shot_type: ShotType | None = None
    winner: Team | None = None
    end_reason: PointEndReason | None = None
    mode: Mode = Mode.TIMELINE


@dataclass(frozen=True)
class SaveTarget:
    labels_root: Path
    labeler: UUID


def apply_action(
    session: LabelingSession, request: ActionRequest, nudge_step_ms: int, target: SaveTarget
) -> Path | None:
    """Apply one action. Returns the saved folder for ``save``, ``None`` otherwise.

    Raises ``LabelingError`` for actions the session rejects and ``ValueError`` for
    malformed requests (a shot without player, a playback action...).
    """
    selected = request.event_id or session.selected
    match request.action:
        case Action.SHOT:
            if request.track_id is None:
                msg = "shot needs track_id"
                raise ValueError(msg)
            session.add_shot(request.time_ms, request.track_id)
        case Action.BOUNCE:
            if request.surface is None:
                msg = "bounce needs surface"
                raise ValueError(msg)
            session.add_bounce(request.time_ms, request.surface)
        case Action.TOGGLE_SIDE:
            session.toggle_side()
        case Action.SELECT_PREV | Action.SELECT_NEXT:
            _select(session, request)
        case Action.NEXT_UNCLASSIFIED | Action.CLASSIFY_SHOT:
            _shot_type_action(session, request, selected)
        case (
            Action.NUDGE_BACK
            | Action.NUDGE_FORWARD
            | Action.MOVE_TO_PLAYHEAD
            | Action.DELETE_SELECTED
        ):
            _edit_selected(session, request, selected, nudge_step_ms)
        case (
            Action.POINT_START
            | Action.POINT_END
            | Action.POINT_REASON
            | Action.POINT_SET_START
            | Action.POINT_SET_END
            | Action.POINT_CANCEL
        ):
            _point_action(session, request, selected)
        case Action.UNDO:
            session.undo()
        case Action.SAVE:
            return session.save(target.labels_root, target.labeler)
        case _:
            msg = f"{request.action} is handled by the browser"
            raise ValueError(msg)
    return None


def _select(session: LabelingSession, request: ActionRequest) -> None:
    """Step the selection; in shot-type mode only over shots."""
    step = -1 if request.action is Action.SELECT_PREV else 1
    if request.mode is Mode.SHOT_TYPE:
        session.select_shot_step(step, request.time_ms)
    elif request.mode is Mode.POINTS:
        session.select_point_step(step, request.time_ms)
    else:
        session.select_step(step, request.time_ms)


def _shot_type_action(
    session: LabelingSession, request: ActionRequest, selected: UUID | None
) -> None:
    """Jump to the next shot without a type, or classify the selected shot."""
    if request.action is Action.NEXT_UNCLASSIFIED:
        session.select_next_unclassified()
        return
    if request.shot_type is None:
        msg = "classify_shot needs shot_type"
        raise ValueError(msg)
    if selected is not None:
        session.classify(selected, request.shot_type)


def _point_action(session: LabelingSession, request: ActionRequest, selected: UUID | None) -> None:
    """Points mode.

    ``point_end`` closes the started point or, if none was started, sets the winner of the
    selected point; the other edits need a selected point and do nothing without one.
    """
    match request.action:
        case Action.POINT_START:
            session.start_point(request.time_ms)
            return
        case Action.POINT_CANCEL:
            session.cancel_point_start()
            return
        case Action.POINT_END:
            if request.winner is None:
                msg = "point_end needs winner"
                raise ValueError(msg)
            if session.pending_point_start is not None:
                session.end_point(request.time_ms, request.winner)
            elif selected is not None:
                session.edit_point(selected, winner=request.winner)
            return
        case Action.POINT_REASON if request.end_reason is None:
            msg = "point_reason needs end_reason"
            raise ValueError(msg)
        case _:
            pass
    if selected is None:
        return
    if request.action is Action.POINT_REASON:
        session.edit_point(selected, end_reason=request.end_reason)
    elif request.action is Action.POINT_SET_START:
        session.edit_point(selected, start_ms=request.time_ms)
    else:
        session.edit_point(selected, end_ms=request.time_ms)


def _edit_selected(
    session: LabelingSession, request: ActionRequest, selected: UUID | None, nudge_step_ms: int
) -> None:
    """Change the selected event; without a selection the shortcut does nothing."""
    if selected is None:
        return
    if request.action is Action.DELETE_SELECTED and request.mode is Mode.POINTS:
        session.remove_point(selected)
    elif request.action is Action.DELETE_SELECTED:
        session.remove(selected)
    elif request.action is Action.MOVE_TO_PLAYHEAD:
        session.move(selected, request.time_ms)
    else:
        sign = -1 if request.action is Action.NUDGE_BACK else 1
        session.nudge(selected, sign * nudge_step_ms)


def score_json(score: Score) -> dict[str, Any]:
    """JSON-ready score; ``calls`` are keys of the page's es-AR texts."""
    return {
        "sets": [list(games) for games in score.sets],
        "sets_won": list(score.sets_won),
        "games": list(score.games),
        "points": list(score.points),
        "tiebreak": score.tiebreak,
        "super_tiebreak": score.super_tiebreak,
        "calls": list(score.calls) if score.calls else None,
        "deuce": score.deuce,
        "winner": score.winner.value if score.winner else None,
        "points_after_end": score.points_after_end,
    }


def _points_state(session: LabelingSession, scoring: ScoringRules) -> dict[str, Any]:
    after = session.scores_after_each_point(scoring)
    return {
        "pending_point_start": session.pending_point_start,
        "golden_point": session.match_format.golden_point,
        "super_tiebreak": session.match_format.super_tiebreak,
        "score": score_json(session.score(scoring)),
        "points": [
            {
                "id": str(point.id),
                "number": point.number,
                "start_ms": point.start_ms,
                "end_ms": point.end_ms,
                "winner": point.winner.value,
                "end_reason": point.end_reason.value,
                "score_after": score_json(score),
            }
            for point, score in zip(session.points, after, strict=True)
        ],
    }


def session_state(
    session: LabelingSession,
    other_counts: Mapping[ShotType, int] | None = None,
    scoring: ScoringRules | None = None,
) -> dict[str, Any]:
    """JSON-ready view of the session for the page.

    ``other_counts`` are the shot types already stored for other matches, so the progress
    against the per-type goal covers the whole data set and not only this video.
    """
    counts = session.shot_type_counts()
    others = other_counts or {}
    state: dict[str, Any] = _points_state(session, scoring) if scoring else {}
    return state | {
        "match_id": str(session.match_id),
        "camera": session.camera.value,
        "side": session.side.value,
        "duration_ms": session.duration_ms,
        "dirty": session.dirty,
        "can_undo": session.can_undo,
        "selected": str(session.selected) if session.selected else None,
        "version": session.base.info.version if session.base else None,
        "shot_type_counts": {
            shot_type.value: count + others.get(shot_type, 0) for shot_type, count in counts.items()
        },
        "unclassified": sum(1 for s in session.shots if session.shot_type_of(s.id) is None),
        "events": [
            {
                "id": str(event.id),
                "kind": event.kind,
                "time_ms": event.time_ms,
                "track_id": event.track_id,
                "surface": event.surface.value if event.surface else None,
                "side": event.side.value if event.side else None,
                "shot_type": (
                    shot_type.value if (shot_type := session.shot_type_of(event.id)) else None
                ),
            }
            for event in session.events()
        ],
    }
