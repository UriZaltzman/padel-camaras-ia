import json
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest

from edge_agent.recorder.continuity import Span, find_gaps
from edge_agent.recorder.schedule import (
    MARGIN,
    ScheduleError,
    Shift,
    Window,
    cameras_due,
    load_schedule,
    parse_schedule,
    recording_windows,
)
from edge_agent.recorder.segments import SEGMENT_SECONDS

ART = timezone(timedelta(hours=-3))
DAY = datetime(2026, 10, 17, tzinfo=ART)


def shift(
    shift_id: str, start_h: float, minutes: int = 90, cameras: tuple[str, ...] = ("court-1-a",)
) -> Shift:
    start = DAY + timedelta(hours=start_h)
    return Shift(id=shift_id, cameras=cameras, start=start, end=start + timedelta(minutes=minutes))


def utc(hours: float) -> datetime:
    return (DAY + timedelta(hours=hours)).astimezone(UTC)


def test_margin_is_two_minutes() -> None:
    assert timedelta(minutes=2) == MARGIN


def test_window_adds_margin_both_sides_in_utc() -> None:
    windows = recording_windows([shift("t1", 20)])

    assert windows == [Window("court-1-a", utc(20) - MARGIN, utc(21.5) + MARGIN)]
    assert windows[0].start.tzinfo == UTC


def test_back_to_back_shifts_merge_into_one_recording() -> None:
    windows = recording_windows([shift("t2", 21.5), shift("t1", 20)])

    assert windows == [Window("court-1-a", utc(20) - MARGIN, utc(23) + MARGIN)]


def test_shifts_with_a_break_stay_apart() -> None:
    windows = recording_windows([shift("t1", 18), shift("t2", 20)])

    assert [(w.start, w.end) for w in windows] == [
        (utc(18) - MARGIN, utc(19.5) + MARGIN),
        (utc(20) - MARGIN, utc(21.5) + MARGIN),
    ]


def test_windows_are_per_camera() -> None:
    windows = recording_windows(
        [
            shift("t1", 20, cameras=("court-1-a", "court-1-b")),
            shift("t2", 20, cameras=("court-2-a",)),
        ]
    )

    assert sorted(w.camera for w in windows) == ["court-1-a", "court-1-b", "court-2-a"]


def test_cameras_due_honours_margins() -> None:
    windows = recording_windows([shift("t1", 20, cameras=("court-1-a", "court-1-b"))])
    both = frozenset({"court-1-a", "court-1-b"})

    assert cameras_due(windows, utc(20) - MARGIN - timedelta(seconds=1)) == frozenset()
    assert cameras_due(windows, utc(20) - MARGIN) == both
    assert cameras_due(windows, utc(21.5) + timedelta(minutes=1)) == both
    assert cameras_due(windows, utc(21.5) + MARGIN) == frozenset()


def test_ten_back_to_back_shifts_two_cameras_continuity() -> None:
    """Issue #8's done criterion, in pure logic: 10 x 90 min, 2 cameras, no missing segment."""
    cameras = ("court-1-a", "court-1-b")
    shifts = [shift(f"t{i}", 8 + i * 1.5, cameras=cameras) for i in range(10)]
    windows = recording_windows(shifts)
    assert len(windows) == 2  # one uninterrupted recording per camera

    for window in windows:
        count = int((window.end - window.start).total_seconds()) // SEGMENT_SECONDS
        spans = [
            Span(window.start + timedelta(seconds=i * SEGMENT_SECONDS), SEGMENT_SECONDS)
            for i in range(count)
        ]
        for s in shifts:
            assert find_gaps(spans, *s.window()) == []
        del spans[count // 2]
        # The missing segment is reported (by both shifts if it falls in a shared margin).
        assert 1 <= sum(len(find_gaps(spans, *s.window())) for s in shifts) <= 2


def test_parse_schedule_file(tmp_path: Path) -> None:
    path = tmp_path / "schedule.json"
    path.write_text(
        json.dumps(
            {
                "shifts": [
                    {
                        "id": "t1",
                        "cameras": ["court-1-a", "court-1-b"],
                        "start": "2026-10-17T20:00:00-03:00",
                        "end": "2026-10-17T21:30:00-03:00",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    (loaded,) = load_schedule(path)

    assert loaded.cameras == ("court-1-a", "court-1-b")
    assert loaded.window()[0] == datetime(2026, 10, 17, 22, 58, tzinfo=UTC)


@pytest.mark.parametrize(
    "shift_json",
    [
        {
            "id": "t",
            "cameras": ["court-1-a"],
            "start": "2026-10-17T20:00:00",
            "end": "2026-10-17T21:30:00",
        },
        {
            "id": "t",
            "cameras": ["court-1-a"],
            "start": "2026-10-17T21:30:00Z",
            "end": "2026-10-17T20:00:00Z",
        },
        {
            "id": "t",
            "cameras": ["court-1-a"],
            "start": "2026-10-17T00:00:00Z",
            "end": "2026-10-18T00:00:00Z",
        },
        {"id": "t", "cameras": [], "start": "2026-10-17T20:00:00Z", "end": "2026-10-17T21:00:00Z"},
        {
            "id": "t",
            "cameras": ["Court 1"],
            "start": "2026-10-17T20:00:00Z",
            "end": "2026-10-17T21:00:00Z",
        },
        {
            "id": "t",
            "cameras": ["court-1-a"],
            "start": "2026-10-17T20:00:00Z",
            "end": "2026-10-17T21:00:00Z",
            "x": 1,
        },
    ],
)
def test_rejects_invalid_shifts(shift_json: dict[str, object]) -> None:
    with pytest.raises(ScheduleError):
        parse_schedule(json.dumps({"shifts": [shift_json]}))


def test_rejects_bad_json_and_missing_file(tmp_path: Path) -> None:
    with pytest.raises(ScheduleError):
        parse_schedule("{not json")
    with pytest.raises(ScheduleError, match="Cannot read"):
        load_schedule(tmp_path / "missing.json")


def test_empty_schedule() -> None:
    assert parse_schedule("{}") == ()
    assert recording_windows([]) == []
