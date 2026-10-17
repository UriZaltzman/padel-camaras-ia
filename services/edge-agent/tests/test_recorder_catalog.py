import sqlite3
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

import pytest

from edge_agent.recorder.catalog import from_db_time, record_segment, spans_between, to_db_time
from edge_agent.recorder.continuity import Span
from edge_agent.store import open_store, schema_version

T0 = datetime(2026, 10, 17, 23, 0, tzinfo=UTC)


@pytest.fixture
def conn(tmp_path: Path) -> Iterator[sqlite3.Connection]:
    connection = open_store(tmp_path / "edge.sqlite3")
    yield connection
    connection.close()


def save(conn: sqlite3.Connection, camera: str, offset_s: int, duration_s: float = 10.0) -> bool:
    started = T0 + timedelta(seconds=offset_s)
    return record_segment(
        conn,
        camera=camera,
        path=Path(f"/data/{camera}/{camera}-{offset_s}.ts"),
        started_at=started,
        duration_s=duration_s,
        size_bytes=4_500_000,
    )


def test_store_migrates_to_segments_table(conn: sqlite3.Connection) -> None:
    assert schema_version(conn) == 2
    columns = {row[1] for row in conn.execute("PRAGMA table_info(segments)")}
    assert {"id", "camera", "path", "started_at", "duration_ms", "size_bytes"} <= columns


def test_record_segment_is_idempotent_and_uses_uuid7(conn: sqlite3.Connection) -> None:
    assert save(conn, "court-1-a", 0) is True
    assert save(conn, "court-1-a", 0) is False

    (segment_id,) = conn.execute("SELECT id FROM segments").fetchone()
    assert UUID(segment_id).version == 7


def test_spans_between_filters_by_camera_and_time(conn: sqlite3.Connection) -> None:
    for offset in (-120, -5, 0, 10, 20, 60):
        save(conn, "court-1-a", offset)
    save(conn, "court-1-b", 0)

    spans = spans_between(conn, "court-1-a", T0, T0 + timedelta(seconds=30))

    assert spans == [
        Span(T0 - timedelta(seconds=5), 10.0),
        Span(T0, 10.0),
        Span(T0 + timedelta(seconds=10), 10.0),
        Span(T0 + timedelta(seconds=20), 10.0),
    ]


def test_db_time_is_sortable_utc_text() -> None:
    art = timezone(timedelta(hours=-3))
    value = datetime(2026, 10, 17, 20, 0, 0, 123456, tzinfo=art)

    assert to_db_time(value) == "2026-10-17T23:00:00.123Z"
    assert from_db_time("2026-10-17T23:00:00.123Z") == datetime(
        2026, 10, 17, 23, 0, 0, 123000, tzinfo=UTC
    )
    with pytest.raises(ValueError, match="timezone"):
        to_db_time(datetime(2026, 10, 17))  # noqa: DTZ001
