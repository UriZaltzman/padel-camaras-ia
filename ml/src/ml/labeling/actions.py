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
from ml.schemas import ShotType, Surface

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
    """Which page the labeler is on: the timeline or the shot-type clips."""

    TIMELINE = "timeline"
    SHOT_TYPE = "shot_type"


class ActionRequest(BaseModel):
    """What the page sends for a labeling shortcut: the action and the playhead time."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    action: Action
    time_ms: Annotated[int, Field(ge=0)]
    track_id: Annotated[int, Field(ge=0)] | None = None
    surface: Surface | None = None
    event_id: UUID | None = None
    shot_type: ShotType | None = None
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
        case Action.NUDGE_BACK | Action.NUDGE_FORWARD | Action.MOVE_TO_PLAYHEAD:
            _edit_selected(session, request, selected, nudge_step_ms)
        case Action.DELETE_SELECTED:
            _edit_selected(session, request, selected, nudge_step_ms)
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


def _edit_selected(
    session: LabelingSession, request: ActionRequest, selected: UUID | None, nudge_step_ms: int
) -> None:
    """Change the selected event; without a selection the shortcut does nothing."""
    if selected is None:
        return
    if request.action is Action.DELETE_SELECTED:
        session.remove(selected)
    elif request.action is Action.MOVE_TO_PLAYHEAD:
        session.move(selected, request.time_ms)
    else:
        sign = -1 if request.action is Action.NUDGE_BACK else 1
        session.nudge(selected, sign * nudge_step_ms)


def session_state(
    session: LabelingSession, other_counts: Mapping[ShotType, int] | None = None
) -> dict[str, Any]:
    """JSON-ready view of the session for the page.

    ``other_counts`` are the shot types already stored for other matches, so the progress
    against the per-type goal covers the whole data set and not only this video.
    """
    counts = session.shot_type_counts()
    others = other_counts or {}
    return {
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
