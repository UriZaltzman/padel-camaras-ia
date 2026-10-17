"""Segment files: names, and the CSV list FFmpeg writes as each segment is closed.

A segment is ``<camera>-<YYYYMMDDTHHMMSSZ>.ts``: the camera and the UTC second FFmpeg
opened it (``-strftime`` with ``TZ=UTC``). MPEG-TS survives a power cut mid-segment
(no index at the end of the file, unlike MP4).
"""

import csv
import io
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Final

SEGMENT_SECONDS: Final = 10
SEGMENT_SUFFIX: Final = ".ts"
TIMESTAMP_FORMAT: Final = "%Y%m%dT%H%M%SZ"
CAMERA_NAME_PATTERN: Final = r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$"

_CAMERA_NAME_RE: Final = re.compile(CAMERA_NAME_PATTERN)
_SEGMENT_NAME_RE: Final = re.compile(
    rf"^(?P<camera>[a-z0-9-]+)-(?P<ts>\d{{8}}T\d{{6}}Z){re.escape(SEGMENT_SUFFIX)}$"
)


def validate_camera_name(name: str) -> str:
    """Camera names become file names: lowercase letters, digits and dashes only."""
    if _CAMERA_NAME_RE.fullmatch(name) is None:
        msg = f"Invalid camera name {name!r}: use lowercase letters, digits and dashes"
        raise ValueError(msg)
    return name


def segment_pattern(camera: str) -> str:
    """Output pattern for FFmpeg's segment muxer with ``-strftime 1``."""
    return f"{validate_camera_name(camera)}-{TIMESTAMP_FORMAT}{SEGMENT_SUFFIX}"


def segment_name(camera: str, started_at: datetime) -> str:
    """The file name FFmpeg gives a segment of ``camera`` opened at ``started_at``."""
    if started_at.tzinfo is None:
        msg = "started_at must be timezone-aware"
        raise ValueError(msg)
    return started_at.astimezone(UTC).strftime(segment_pattern(camera))


def parse_segment_name(filename: str) -> tuple[str, datetime] | None:
    """``(camera, started_at)`` from a segment file name, or ``None`` if it is not one."""
    match = _SEGMENT_NAME_RE.fullmatch(filename)
    if match is None:
        return None
    try:
        started_at = datetime.strptime(match["ts"], TIMESTAMP_FORMAT).replace(tzinfo=UTC)
    except ValueError:
        return None
    return match["camera"], started_at


@dataclass(frozen=True)
class ListedSegment:
    """One closed segment, as listed by FFmpeg: times are seconds into the stream."""

    filename: str
    start_s: float
    end_s: float

    @property
    def duration_s(self) -> float:
        return self.end_s - self.start_s


def parse_segment_list(text: str) -> list[ListedSegment]:
    """Rows of a ``-segment_list_type csv`` file (``filename,start,end``).

    A row FFmpeg is still writing (power cut, read mid-write) is skipped: it shows up
    complete on the next read.
    """
    segments = []
    for row in csv.reader(io.StringIO(text)):
        if len(row) != 3:  # noqa: PLR2004 - filename, start, end
            continue
        filename, start, end = row
        try:
            start_s, end_s = float(start), float(end)
        except ValueError:
            continue
        if not filename or end_s < start_s:
            continue
        segments.append(ListedSegment(filename, start_s, end_s))
    return segments
