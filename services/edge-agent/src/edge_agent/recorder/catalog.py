"""Segment metadata in the local SQLite store (table ``segments``, migration 2).

Times are stored as UTC ISO strings with milliseconds and a ``Z`` so that text order
is time order.
"""

import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Final

from edge_agent.ids import uuid7
from edge_agent.recorder.continuity import Span

# A segment can start this long before a window and still cover its first seconds.
LOOKBACK: Final = timedelta(minutes=1)


def to_db_time(value: datetime) -> str:
    if value.tzinfo is None:
        msg = "datetime must be timezone-aware"
        raise ValueError(msg)
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def from_db_time(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=UTC)


def record_segment(
    conn: sqlite3.Connection,
    *,
    camera: str,
    path: Path,
    started_at: datetime,
    duration_s: float,
    size_bytes: int,
) -> bool:
    """Save a closed segment. Returns ``False`` if it was already saved (same path)."""
    with conn:
        cursor = conn.execute(
            """
            INSERT INTO segments (id, camera, path, started_at, duration_ms, size_bytes)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (path) DO NOTHING
            """,
            (
                str(uuid7()),
                camera,
                str(path),
                to_db_time(started_at),
                round(duration_s * 1000),
                size_bytes,
            ),
        )
    return cursor.rowcount == 1


def spans_between(
    conn: sqlite3.Connection, camera: str, start: datetime, end: datetime
) -> list[Span]:
    """Segments of ``camera`` that may overlap ``[start, end)``, oldest first."""
    rows = conn.execute(
        """
        SELECT started_at, duration_ms FROM segments
        WHERE camera = ? AND started_at >= ? AND started_at < ?
        ORDER BY started_at
        """,
        (camera, to_db_time(start - LOOKBACK), to_db_time(end)),
    ).fetchall()
    return [Span(from_db_time(str(started)), int(ms) / 1000) for started, ms in rows]
