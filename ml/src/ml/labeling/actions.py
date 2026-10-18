"""Translate a shortcut pressed in the browser into a session change, and the session into JSON.

Kept apart from the HTTP server so it can be tested without a browser or a socket.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ml.labeling.config import Action
from ml.labeling.session import LabelingSession
from ml.schemas import Surface

PLAYBACK_ACTIONS = frozenset(
    {
        Action.PLAY_PAUSE,
        Action.SEEK_BACK,
        Action.SEEK_FORWARD,
        Action.SEEK_BACK_FINE,
        Action.SEEK_FORWARD_FINE,
        Action.CYCLE_RATE,
    }
)
"""Handled by the video element in the browser; they never reach the session."""


class ActionRequest(BaseModel):
    """What the page sends for a labeling shortcut: the action and the playhead time."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    action: Action
    time_ms: Annotated[int, Field(ge=0)]
    track_id: Annotated[int, Field(ge=0)] | None = None
    surface: Surface | None = None
    event_id: UUID | None = None


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
        case Action.SELECT_PREV:
            session.select_step(-1, request.time_ms)
        case Action.SELECT_NEXT:
            session.select_step(1, request.time_ms)
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


def session_state(session: LabelingSession) -> dict[str, Any]:
    """JSON-ready view of the session for the page."""
    return {
        "match_id": str(session.match_id),
        "camera": session.camera.value,
        "side": session.side.value,
        "duration_ms": session.duration_ms,
        "dirty": session.dirty,
        "can_undo": session.can_undo,
        "selected": str(session.selected) if session.selected else None,
        "version": session.base.info.version if session.base else None,
        "events": [
            {
                "id": str(event.id),
                "kind": event.kind,
                "time_ms": event.time_ms,
                "track_id": event.track_id,
                "surface": event.surface.value if event.surface else None,
                "side": event.side.value if event.side else None,
            }
            for event in session.events()
        ],
    }
