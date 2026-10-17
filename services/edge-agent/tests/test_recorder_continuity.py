from datetime import UTC, datetime, timedelta

import pytest

from edge_agent.recorder.continuity import Gap, Span, find_gaps

T0 = datetime(2026, 10, 17, 22, 58, tzinfo=UTC)


def at(seconds: float) -> datetime:
    return T0 + timedelta(seconds=seconds)


def contiguous(start_s: float, count: int, length_s: float = 10.0) -> list[Span]:
    return [Span(at(start_s + i * length_s), length_s) for i in range(count)]


def test_continuous_recording_has_no_gaps() -> None:
    assert find_gaps(contiguous(0, 6), at(0), at(60)) == []


def test_detects_one_missing_segment() -> None:
    spans = contiguous(0, 6)
    del spans[3]

    assert find_gaps(spans, at(0), at(60)) == [Gap(at(30), at(40))]


def test_detects_missing_start_and_end() -> None:
    gaps = find_gaps(contiguous(20, 2), at(0), at(60))

    assert gaps == [Gap(at(0), at(20)), Gap(at(40), at(60))]
    assert [g.seconds for g in gaps] == [20.0, 20.0]


def test_nothing_recorded_is_one_gap() -> None:
    assert find_gaps([], at(0), at(60)) == [Gap(at(0), at(60))]


def test_tolerates_second_rounding_and_connection_time() -> None:
    # Names round down to the second; segments are cut on keyframes, not exactly at 10 s.
    spans = [Span(at(1), 9.2), Span(at(10), 10.4), Span(at(21), 9.0), Span(at(30), 30.0)]

    assert find_gaps(spans, at(0), at(60), tolerance_s=2.0) == []
    assert find_gaps(spans, at(0), at(60), tolerance_s=0.7) == [Gap(at(0), at(1))]


def test_unordered_overlapping_and_outside_spans() -> None:
    spans = [
        Span(at(30), 30),
        Span(at(-100), 10),
        Span(at(-5), 20),
        Span(at(10), 25),
        Span(at(90), 10),
    ]

    assert find_gaps(spans, at(0), at(60)) == []


def test_segment_crossing_window_start_counts() -> None:
    assert find_gaps([Span(at(-8), 10), *contiguous(2, 6)], at(0), at(60)) == []


def test_window_must_be_positive() -> None:
    with pytest.raises(ValueError, match="after"):
        find_gaps([], at(10), at(10))
