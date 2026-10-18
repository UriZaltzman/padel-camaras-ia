"""Local schedule: which cameras record when, with 2 minutes of margin on each side.

In phase 0 the schedule is a JSON file written by hand (later the ``scheduler`` writes
it from the bookings)::

    {"shifts": [{"id": "turno-1", "cameras": ["court-1-a", "court-1-b"],
                 "start": "2026-10-17T20:00:00-03:00", "end": "2026-10-17T21:30:00-03:00"}]}

Times must carry their UTC offset; they are handled in UTC.
"""

import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Final, Self

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    model_validator,
)

from edge_agent.recorder.segments import validate_camera_name

MARGIN: Final = timedelta(minutes=2)
MAX_SHIFT: Final = timedelta(hours=12)

CameraName = Annotated[str, AfterValidator(validate_camera_name)]


class ScheduleError(Exception):
    """The schedule file is missing or invalid."""


class Shift(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str = Field(min_length=1, max_length=64)
    cameras: tuple[CameraName, ...] = Field(min_length=1)
    start: AwareDatetime
    end: AwareDatetime

    @model_validator(mode="after")
    def _check_times(self) -> Self:
        if self.end <= self.start:
            msg = "end must be after start"
            raise ValueError(msg)
        if self.end - self.start > MAX_SHIFT:
            msg = f"a shift cannot last more than {MAX_SHIFT}"
            raise ValueError(msg)
        return self

    def window(self, margin: timedelta = MARGIN) -> tuple[datetime, datetime]:
        """``[start - margin, end + margin]`` in UTC."""
        return (self.start - margin).astimezone(UTC), (self.end + margin).astimezone(UTC)


class ScheduleFile(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    shifts: tuple[Shift, ...] = ()


def parse_schedule(raw: str) -> tuple[Shift, ...]:
    try:
        return ScheduleFile.model_validate(json.loads(raw)).shifts
    except (ValueError, ValidationError) as error:
        msg = f"Invalid schedule: {error}"
        raise ScheduleError(msg) from None


def load_schedule(path: Path) -> tuple[Shift, ...]:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as error:
        msg = f"Cannot read schedule {path}: {error.strerror}"
        raise ScheduleError(msg) from None
    return parse_schedule(raw)


@dataclass(frozen=True, order=True)
class Window:
    """A stretch during which ``camera`` must be recording."""

    camera: str
    start: datetime
    end: datetime


def recording_windows(shifts: Iterable[Shift], margin: timedelta = MARGIN) -> list[Window]:
    """One window per camera and stretch, margins included.

    Overlapping or touching windows are merged, so back-to-back shifts record as one
    continuous stretch instead of stopping and starting FFmpeg between them.
    """
    per_camera: dict[str, list[tuple[datetime, datetime]]] = {}
    for shift in shifts:
        start, end = shift.window(margin)
        for camera in shift.cameras:
            per_camera.setdefault(camera, []).append((start, end))
    windows = []
    for camera, intervals in per_camera.items():
        intervals.sort()
        current_start, current_end = intervals[0]
        for start, end in intervals[1:]:
            if start <= current_end:
                current_end = max(current_end, end)
            else:
                windows.append(Window(camera, current_start, current_end))
                current_start, current_end = start, end
        windows.append(Window(camera, current_start, current_end))
    return sorted(windows)


def cameras_due(windows: Iterable[Window], now: datetime) -> frozenset[str]:
    """Cameras that must be recording at ``now``."""
    return frozenset(w.camera for w in windows if w.start <= now < w.end)
