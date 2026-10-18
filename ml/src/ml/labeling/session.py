"""Labeling state machine: add, remove and move shots and bounces, undo, validate and save.

This module is pure Python with no UI: the local web page only sends actions here and shows
the resulting state. It works on a single video (one camera) as well as on one camera of a
two-camera recording; the camera of the video being labeled is stamped on every event.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable, Iterable
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path
from typing import Literal
from uuid import UUID

import uuid6

from ml.labels import (
    BounceLabel,
    LabelSetInfo,
    MatchLabels,
    ShotLabel,
    ShotTypeLabel,
    list_label_set_versions,
    read_label_set,
    write_label_set,
)
from ml.schemas import Camera, CourtSide, ShotType, Surface

type Event = ShotLabel | BounceLabel


def new_uuid7() -> UUID:
    """A fresh UUID v7 for labels, matches and labelers."""
    return uuid6.uuid7()


class ErrorCode(StrEnum):
    """Stable error codes; the UI shows the es-AR message for each one."""

    TIME_NEGATIVE = "LABEL_TIME_NEGATIVE"
    TIME_AFTER_END = "LABEL_TIME_AFTER_END"
    EVENT_NOT_FOUND = "LABEL_EVENT_NOT_FOUND"
    NOTHING_TO_UNDO = "LABEL_NOTHING_TO_UNDO"
    NOTHING_TO_SAVE = "LABEL_NOTHING_TO_SAVE"
    NOT_A_SHOT = "LABEL_NOT_A_SHOT"


class LabelingError(ValueError):
    """An action the labeling session rejected, with a stable code for the UI."""

    def __init__(self, code: ErrorCode, detail: str) -> None:
        super().__init__(f"{code.value}: {detail}")
        self.code = code


def _retimed[T: (ShotLabel, BounceLabel)](
    events: tuple[T, ...], event_id: UUID, time_ms: int
) -> tuple[T, ...]:
    return tuple(
        event.model_copy(update={"time_ms": time_ms}) if event.id == event_id else event
        for event in events
    )


@dataclass(frozen=True)
class _Snapshot:
    shots: tuple[ShotLabel, ...]
    bounces: tuple[BounceLabel, ...]
    shot_types: tuple[ShotTypeLabel, ...] = ()


def count_shot_types(labels: Iterable[ShotTypeLabel]) -> dict[ShotType, int]:
    """How many shots of each type (every type present, zero if none)."""
    counts = Counter(label.shot_type for label in labels)
    return {shot_type: counts[shot_type] for shot_type in ShotType}


@dataclass(frozen=True)
class EventView:
    """One event as the timeline shows it."""

    id: UUID
    kind: Literal["shot", "bounce"]
    time_ms: int
    track_id: int | None
    surface: Surface | None
    side: CourtSide | None


class LabelingSession:
    """One labeler's pass over one video of a match.

    If ``base`` is given (a stored version of the label set), editing starts from it and
    saving stores a new version; shot types and points from the base are kept, except the
    shot types of shots removed here. Shot types are edited here too (shot-type mode) and
    share the same undo history.
    """

    def __init__(
        self,
        match_id: UUID,
        camera: Camera = Camera.A,
        base: MatchLabels | None = None,
        id_factory: Callable[[], UUID] = new_uuid7,
    ) -> None:
        if base is not None and base.info.match_id != match_id:
            msg = f"base label set is for match {base.info.match_id}, not {match_id}"
            raise ValueError(msg)
        self.match_id = match_id
        self.camera = camera
        self.base = base
        self._new_id = id_factory
        self._state = _Snapshot(
            shots=base.shots if base else (),
            bounces=base.bounces if base else (),
            shot_types=base.shot_types if base else (),
        )
        self._history: list[_Snapshot] = []
        self._saved_state = self._state
        self.duration_ms: int | None = None
        self.side = CourtSide.A
        self.selected: UUID | None = None

    # -- reading -----------------------------------------------------------------------

    @property
    def shots(self) -> tuple[ShotLabel, ...]:
        return self._state.shots

    @property
    def bounces(self) -> tuple[BounceLabel, ...]:
        return self._state.bounces

    @property
    def shot_types(self) -> tuple[ShotTypeLabel, ...]:
        return self._state.shot_types

    def shot_type_of(self, shot_id: UUID) -> ShotType | None:
        return next((t.shot_type for t in self.shot_types if t.shot_id == shot_id), None)

    def shot_type_counts(self) -> dict[ShotType, int]:
        """Shots of this match per type, as they stand (saved or not)."""
        return count_shot_types(self.shot_types)

    @property
    def dirty(self) -> bool:
        """True when there are changes not saved yet."""
        return self._state != self._saved_state

    @property
    def can_undo(self) -> bool:
        return bool(self._history)

    def events(self) -> list[EventView]:
        """All events in time order (shots before bounces at the same time)."""
        views = [EventView(s.id, "shot", s.time_ms, s.track_id, None, None) for s in self.shots] + [
            EventView(b.id, "bounce", b.time_ms, None, b.surface, b.side) for b in self.bounces
        ]
        return sorted(views, key=lambda view: (view.time_ms, view.kind != "shot", str(view.id)))

    def _find(self, event_id: UUID) -> Event:
        for shot in self.shots:
            if shot.id == event_id:
                return shot
        for bounce in self.bounces:
            if bounce.id == event_id:
                return bounce
        raise LabelingError(ErrorCode.EVENT_NOT_FOUND, str(event_id))

    # -- settings ----------------------------------------------------------------------

    def set_duration(self, duration_ms: int) -> None:
        """Video length reported by the player; events after it are rejected."""
        self._check_time(duration_ms)
        self.duration_ms = duration_ms

    def toggle_side(self) -> CourtSide:
        """Switch the court side stamped on the next bounces."""
        self.side = CourtSide.B if self.side is CourtSide.A else CourtSide.A
        return self.side

    # -- editing -----------------------------------------------------------------------

    def _check_time(self, time_ms: int) -> None:
        if time_ms < 0:
            raise LabelingError(ErrorCode.TIME_NEGATIVE, str(time_ms))
        if self.duration_ms is not None and time_ms > self.duration_ms:
            raise LabelingError(ErrorCode.TIME_AFTER_END, f"{time_ms} > {self.duration_ms}")

    def _commit(self, state: _Snapshot) -> None:
        self._history.append(self._state)
        self._state = state

    def add_shot(self, time_ms: int, track_id: int) -> UUID:
        self._check_time(time_ms)
        shot = ShotLabel(id=self._new_id(), time_ms=time_ms, track_id=track_id, camera=self.camera)
        self._commit(replace(self._state, shots=(*self.shots, shot)))
        self.selected = shot.id
        return shot.id

    def add_bounce(self, time_ms: int, surface: Surface, side: CourtSide | None = None) -> UUID:
        self._check_time(time_ms)
        bounce = BounceLabel(
            id=self._new_id(),
            time_ms=time_ms,
            surface=surface,
            side=side or self.side,
            camera=self.camera,
        )
        self._commit(replace(self._state, bounces=(*self.bounces, bounce)))
        self.selected = bounce.id
        return bounce.id

    def remove(self, event_id: UUID) -> None:
        self._find(event_id)
        self._commit(
            _Snapshot(
                shots=tuple(s for s in self.shots if s.id != event_id),
                bounces=tuple(b for b in self.bounces if b.id != event_id),
                shot_types=tuple(t for t in self.shot_types if t.shot_id != event_id),
            )
        )
        if self.selected == event_id:
            self.selected = None

    def move(self, event_id: UUID, time_ms: int) -> None:
        self._check_time(time_ms)
        self._find(event_id)
        self._commit(
            replace(
                self._state,
                shots=_retimed(self.shots, event_id, time_ms),
                bounces=_retimed(self.bounces, event_id, time_ms),
            )
        )
        self.selected = event_id

    def nudge(self, event_id: UUID, delta_ms: int) -> None:
        self.move(event_id, self._find(event_id).time_ms + delta_ms)

    def undo(self) -> None:
        if not self._history:
            raise LabelingError(ErrorCode.NOTHING_TO_UNDO, "history is empty")
        self._state = self._history.pop()
        if self.selected is not None and self.selected not in {e.id for e in self.events()}:
            self.selected = None

    def classify(self, shot_id: UUID, shot_type: ShotType) -> None:
        """Set (or change) the type of a shot, then select the next shot in time.

        Classifying with the type it already has changes nothing and adds no undo step.
        """
        if not any(shot.id == shot_id for shot in self.shots):
            self._find(shot_id)
            raise LabelingError(ErrorCode.NOT_A_SHOT, str(shot_id))
        if self.shot_type_of(shot_id) is not shot_type:
            label = ShotTypeLabel(shot_id=shot_id, shot_type=shot_type)
            others = tuple(t for t in self.shot_types if t.shot_id != shot_id)
            self._commit(replace(self._state, shot_types=(*others, label)))
        self.selected = self._next_shot(shot_id, unclassified=False) or shot_id

    def _shots_in_order(self) -> list[ShotLabel]:
        return sorted(self.shots, key=lambda s: (s.time_ms, str(s.id)))

    def _next_shot(self, after: UUID | None, *, unclassified: bool) -> UUID | None:
        ordered = self._shots_in_order()
        ids = [s.id for s in ordered]
        start = ids.index(after) + 1 if after in ids else 0
        rotated = ordered[start:] + ordered[:start] if unclassified else ordered[start:]
        for shot in rotated:
            if not unclassified or self.shot_type_of(shot.id) is None:
                return shot.id
        return None

    def select_next_unclassified(self) -> UUID | None:
        """Select the next shot without a type after the selected one, wrapping around."""
        found = self._next_shot(self.selected, unclassified=True)
        if found is not None:
            self.selected = found
        return found

    def select_shot_step(self, step: int, time_ms: int) -> UUID | None:
        """Like ``select_step`` but only over shots (shot-type mode)."""
        ordered = self._shots_in_order()
        if not ordered:
            self.selected = None
            return None
        ids = [s.id for s in ordered]
        if self.selected not in ids:
            self.selected = min(ordered, key=lambda s: abs(s.time_ms - time_ms)).id
            return self.selected
        index = min(max(ids.index(self.selected) + step, 0), len(ids) - 1)
        self.selected = ids[index]
        return self.selected

    # -- selection ---------------------------------------------------------------------

    def select_nearest(self, time_ms: int) -> UUID | None:
        events = self.events()
        self.selected = min(events, key=lambda e: abs(e.time_ms - time_ms)).id if events else None
        return self.selected

    def select_step(self, step: int, time_ms: int) -> UUID | None:
        """Select the next (step > 0) or previous event; from the playhead if none selected."""
        events = self.events()
        if not events:
            self.selected = None
            return None
        ids = [e.id for e in events]
        if self.selected not in ids:
            return self.select_nearest(time_ms)
        index = min(max(ids.index(self.selected) + step, 0), len(ids) - 1)
        self.selected = ids[index]
        return self.selected

    # -- saving ------------------------------------------------------------------------

    def build(self, labeler: UUID, version: int, labeled_at: datetime) -> MatchLabels:
        """The label set as it stands, validated by ``MatchLabels``."""
        shot_ids = {shot.id for shot in self.shots}
        base = self.base
        return MatchLabels(
            info=LabelSetInfo(
                match_id=self.match_id, version=version, labeler=labeler, labeled_at=labeled_at
            ),
            shots=tuple(sorted(self.shots, key=lambda s: s.time_ms)),
            bounces=tuple(sorted(self.bounces, key=lambda b: b.time_ms)),
            shot_types=tuple(
                sorted(
                    (t for t in self.shot_types if t.shot_id in shot_ids),
                    key=lambda t: str(t.shot_id),
                )
            ),
            points=base.points if base else (),
        )

    def save(self, labels_root: Path, labeler: UUID, now: datetime | None = None) -> Path:
        """Store the labels as the next version of the match and return its folder."""
        if not self.dirty:
            raise LabelingError(ErrorCode.NOTHING_TO_SAVE, "no changes since last save")
        versions = list_label_set_versions(labels_root, self.match_id)
        version = (versions[-1] if versions else 0) + 1
        labels = self.build(labeler, version, now or datetime.now(UTC))
        path = write_label_set(labels_root, labels)
        self.base = labels
        self._saved_state = self._state
        return path


def open_session(labels_root: Path, match_id: UUID, camera: Camera) -> LabelingSession:
    """Start from the latest stored version of the match, or empty if there is none."""
    base = (
        read_label_set(labels_root, match_id)
        if list_label_set_versions(labels_root, match_id)
        else None
    )
    return LabelingSession(match_id, camera, base)


def stored_shot_type_counts(labels_root: Path, exclude: UUID | None = None) -> dict[ShotType, int]:
    """Shot types in the latest version of every match stored under ``labels_root``.

    ``exclude`` leaves out the match being labeled, whose counts come from its session.
    """
    labels: list[ShotTypeLabel] = []
    if labels_root.is_dir():
        for match_dir in sorted(p for p in labels_root.iterdir() if p.is_dir()):
            try:
                match_id = UUID(match_dir.name)
            except ValueError:
                continue
            if match_id != exclude and list_label_set_versions(labels_root, match_id):
                labels.extend(read_label_set(labels_root, match_id).shot_types)
    return count_shot_types(labels)
