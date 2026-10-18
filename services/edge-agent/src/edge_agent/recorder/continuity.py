"""Continuity check: did a camera record the whole window, with no missing segment?

Segments are named by the UTC second they were opened, so a start time is off by up
to 1 s; ``tolerance_s`` absorbs that and the RTSP connection time. A missing segment
(10 s) is always far above the tolerance.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Final

DEFAULT_TOLERANCE_S: Final = 2.0


@dataclass(frozen=True)
class Span:
    """Stretch of time covered by one segment."""

    start: datetime
    duration_s: float

    @property
    def end(self) -> datetime:
        return self.start + timedelta(seconds=self.duration_s)


@dataclass(frozen=True)
class Gap:
    start: datetime
    end: datetime

    @property
    def seconds(self) -> float:
        return (self.end - self.start).total_seconds()


def find_gaps(
    spans: Iterable[Span],
    window_start: datetime,
    window_end: datetime,
    tolerance_s: float = DEFAULT_TOLERANCE_S,
) -> list[Gap]:
    """Every stretch of ``[window_start, window_end]`` longer than ``tolerance_s`` with no
    segment covering it. An empty list means the recording is continuous.
    """
    if window_end <= window_start:
        msg = "window_end must be after window_start"
        raise ValueError(msg)
    tolerance = timedelta(seconds=tolerance_s)
    gaps = []
    covered_until = window_start
    for span in sorted(spans, key=lambda s: s.start):
        if span.end <= window_start or span.start >= window_end:
            continue
        if span.start - covered_until > tolerance:
            gaps.append(Gap(covered_until, span.start))
        covered_until = max(covered_until, span.end)
    if window_end - covered_until > tolerance:
        gaps.append(Gap(covered_until, window_end))
    return gaps
