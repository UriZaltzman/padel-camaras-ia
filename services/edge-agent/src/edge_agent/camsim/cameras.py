"""Simulated cameras and their stream names: ``court-<n>-<a|b>``."""

import re
from dataclasses import dataclass
from typing import Final, Literal, cast

Position = Literal["a", "b"]

POSITIONS: Final[tuple[Position, ...]] = ("a", "b")
STREAM_NAME_RE: Final = re.compile(r"^court-([1-9][0-9]*)-([ab])$")


@dataclass(frozen=True, order=True)
class Camera:
    court: int
    position: Position

    def __post_init__(self) -> None:
        if self.court < 1:
            msg = f"Court numbers start at 1, got {self.court}"
            raise ValueError(msg)
        if self.position not in POSITIONS:
            msg = f"Camera position must be one of {POSITIONS}, got {self.position!r}"
            raise ValueError(msg)

    @property
    def name(self) -> str:
        """Stream path on the RTSP server, e.g. ``court-1-a``."""
        return f"court-{self.court}-{self.position}"

    @classmethod
    def parse(cls, name: str) -> "Camera":
        match = STREAM_NAME_RE.fullmatch(name.strip().lower())
        if match is None:
            msg = f"Invalid camera name {name!r}: expected court-<n>-<a|b>, e.g. court-1-a"
            raise ValueError(msg)
        return cls(court=int(match.group(1)), position=cast("Position", match.group(2)))


def cameras_for(courts: int) -> tuple[Camera, ...]:
    """Every camera of a club with ``courts`` courts, in order: 1-a, 1-b, 2-a, ..."""
    if courts < 1:
        msg = f"A club needs at least 1 court, got {courts}"
        raise ValueError(msg)
    return tuple(
        Camera(court, position) for court in range(1, courts + 1) for position in POSITIONS
    )


def stream_url(base_url: str, camera: Camera) -> str:
    """Full RTSP URL of ``camera`` under ``base_url`` (``rtsp://host:port``)."""
    return f"{base_url.rstrip('/')}/{camera.name}"
