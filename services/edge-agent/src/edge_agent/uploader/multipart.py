"""Resumable multipart upload of recorded segments.

The multipart upload id and every part the object store confirmed (its ETag) are saved
in the local SQLite store (migration 3) right after each part. After a network cut or a
restart the upload continues from the first unconfirmed part: confirmed bytes are never
sent again. Bandwidth is capped with a token bucket before each part goes out.
"""

import logging
import sqlite3
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from edge_agent.uploader.ratelimit import TokenBucket

logger = logging.getLogger("edge_agent.uploader")


class UploadGoneError(Exception):
    """The object store no longer knows the saved upload id (expired or aborted)."""


@dataclass(frozen=True, slots=True)
class Part:
    number: int
    etag: str


class ObjectStore(Protocol):
    """The four multipart calls the uploader needs from an S3-compatible store."""

    def create_upload(self, key: str) -> str: ...

    def upload_part(self, key: str, upload_id: str, number: int, body: bytes) -> str:
        """Send one part and return its ETag. Raises ``UploadGoneError`` if unknown."""
        ...

    def complete_upload(self, key: str, upload_id: str, parts: Sequence[Part]) -> None: ...


@dataclass(frozen=True, slots=True)
class PendingSegment:
    id: str
    camera: str
    path: Path
    started_at: str


def pending_segments(conn: sqlite3.Connection) -> list[PendingSegment]:
    """Recorded segments not yet uploaded, oldest first."""
    rows = conn.execute(
        """
        SELECT s.id, s.camera, s.path, s.started_at FROM segments s
        LEFT JOIN uploads u ON u.segment_id = s.id
        WHERE u.completed_at IS NULL
        ORDER BY s.started_at, s.id
        """
    ).fetchall()
    return [PendingSegment(str(i), str(c), Path(p), str(t)) for i, c, p, t in rows]


def object_key(prefix: str, segment: PendingSegment) -> str:
    return f"{prefix}{segment.camera}/{segment.path.name}"


def _begin(
    conn: sqlite3.Connection, store: ObjectStore, segment_id: str, key: str, part_size: int
) -> tuple[str, int]:
    """Return the upload id and part size to use, creating the upload if needed."""
    row = conn.execute(
        "SELECT upload_id, part_size FROM uploads WHERE segment_id = ?", (segment_id,)
    ).fetchone()
    if row is not None and row[0] is not None:
        # Keep the original part size: confirmed parts depend on it.
        return str(row[0]), int(row[1])
    upload_id = store.create_upload(key)
    with conn:
        conn.execute(
            """
            INSERT INTO uploads (segment_id, object_key, upload_id, part_size)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (segment_id) DO UPDATE SET
                object_key = excluded.object_key,
                upload_id = excluded.upload_id,
                part_size = excluded.part_size,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            """,
            (segment_id, key, upload_id, part_size),
        )
    return upload_id, part_size


def _confirmed(conn: sqlite3.Connection, segment_id: str) -> dict[int, str]:
    rows = conn.execute(
        "SELECT part_number, etag FROM upload_parts WHERE segment_id = ?", (segment_id,)
    ).fetchall()
    return {int(n): str(e) for n, e in rows}


def _forget(conn: sqlite3.Connection, segment_id: str) -> None:
    with conn:
        conn.execute("DELETE FROM upload_parts WHERE segment_id = ?", (segment_id,))
        conn.execute("UPDATE uploads SET upload_id = NULL WHERE segment_id = ?", (segment_id,))


def upload_segment(
    conn: sqlite3.Connection,
    store: ObjectStore,
    segment: PendingSegment,
    *,
    key_prefix: str,
    part_size: int,
    bucket: TokenBucket,
    chunk_bytes: int,
) -> int:
    """Upload ``segment`` (resuming if a previous attempt was cut). Returns bytes sent."""
    key = object_key(key_prefix, segment)
    try:
        return _upload(conn, store, segment, key, part_size, bucket, chunk_bytes)
    except UploadGoneError:
        logger.warning("uploader_upload_restarted", extra={"segment_id": segment.id})
        _forget(conn, segment.id)
        return _upload(conn, store, segment, key, part_size, bucket, chunk_bytes)


def _upload(  # noqa: PLR0917 - internal helper, all arguments are needed
    conn: sqlite3.Connection,
    store: ObjectStore,
    segment: PendingSegment,
    key: str,
    requested_part_size: int,
    bucket: TokenBucket,
    chunk_bytes: int,
) -> int:
    upload_id, part_size = _begin(conn, store, segment.id, key, requested_part_size)
    confirmed = _confirmed(conn, segment.id)
    size = segment.path.stat().st_size
    total_parts = max(1, -(-size // part_size))
    sent = 0
    with segment.path.open("rb") as file:
        for number in range(1, total_parts + 1):
            if number in confirmed:
                continue
            file.seek((number - 1) * part_size)
            body = file.read(part_size)
            for offset in range(0, len(body), chunk_bytes):
                bucket.take(min(chunk_bytes, len(body) - offset))
            etag = store.upload_part(key, upload_id, number, body)
            with conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO upload_parts
                        (segment_id, part_number, etag, size_bytes)
                    VALUES (?, ?, ?, ?)
                    """,
                    (segment.id, number, etag, len(body)),
                )
            confirmed[number] = etag
            sent += len(body)
    parts = [Part(n, confirmed[n]) for n in range(1, total_parts + 1)]
    store.complete_upload(key, upload_id, parts)
    with conn:
        conn.execute(
            """
            UPDATE uploads SET
                completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE segment_id = ?
            """,
            (segment.id,),
        )
    logger.info(
        "uploader_segment_uploaded",
        extra={"segment_id": segment.id, "bytes_sent": sent, "parts": total_parts},
    )
    return sent
