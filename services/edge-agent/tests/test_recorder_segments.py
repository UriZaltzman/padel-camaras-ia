from datetime import UTC, datetime, timedelta, timezone

import pytest

from edge_agent.recorder.segments import (
    ListedSegment,
    parse_segment_list,
    parse_segment_name,
    segment_name,
    segment_pattern,
    validate_camera_name,
)

ART = timezone(timedelta(hours=-3))


def test_pattern_is_strftime_template_per_camera() -> None:
    assert segment_pattern("court-1-a") == "court-1-a-%Y%m%dT%H%M%SZ.ts"


def test_segment_name_is_utc() -> None:
    started = datetime(2026, 10, 17, 20, 0, 10, tzinfo=ART)

    assert segment_name("court-1-a", started) == "court-1-a-20261017T230010Z.ts"


def test_segment_name_needs_timezone() -> None:
    with pytest.raises(ValueError, match="timezone"):
        segment_name("court-1-a", datetime(2026, 10, 17, 20, 0))  # noqa: DTZ001


def test_name_round_trip() -> None:
    started = datetime(2026, 10, 17, 23, 0, 10, tzinfo=UTC)

    assert parse_segment_name(segment_name("court-12-b", started)) == ("court-12-b", started)


@pytest.mark.parametrize(
    "filename",
    [
        "court-1-a-20261017T230010Z.mp4",
        "court-1-a-20261017T230010.ts",
        "court-1-a-20261399T230010Z.ts",
        "segments.csv",
        "",
    ],
)
def test_parse_rejects_other_files(filename: str) -> None:
    assert parse_segment_name(filename) is None


@pytest.mark.parametrize("name", ["Court-1", "court_1", "-court", "court-", "a/b", "", "x" * 65])
def test_camera_names_are_safe_file_names(name: str) -> None:
    with pytest.raises(ValueError, match="Invalid camera name"):
        validate_camera_name(name)


def test_parses_segment_list_and_skips_partial_rows() -> None:
    text = (
        "court-1-a-20261017T230000Z.ts,0.000000,10.040000\n"
        "court-1-a-20261017T230010Z.ts,10.040000,20.000000\n"
        "court-1-a-20261017T230020Z.ts,20.0000\n"  # being written
        "garbage\n"
        "court-1-a-20261017T230030Z.ts,abc,40\n"
    )

    segments = parse_segment_list(text)

    assert segments == [
        ListedSegment("court-1-a-20261017T230000Z.ts", 0.0, 10.04),
        ListedSegment("court-1-a-20261017T230010Z.ts", 10.04, 20.0),
    ]
    assert segments[0].duration_s == pytest.approx(10.04)


def test_empty_segment_list() -> None:
    assert parse_segment_list("") == []
