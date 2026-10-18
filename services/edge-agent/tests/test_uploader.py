"""Uploader unit tests with an in-memory fake S3 store and a fake clock."""

import logging
import os
import sqlite3
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

import pytest

from edge_agent.recorder.catalog import record_segment
from edge_agent.store import open_store
from edge_agent.uploader.cli import upload_pending
from edge_agent.uploader.multipart import Part, UploadGoneError, pending_segments
from edge_agent.uploader.ratelimit import TokenBucket
from edge_agent.uploader.settings import S3_MIN_PART_BYTES, UploaderSettings

PART = S3_MIN_PART_BYTES
CHUNK = 64 * 1024


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.now += seconds


class FakeStore:
    """Multipart semantics of S3, plus a switch that cuts the network after N parts."""

    def __init__(self) -> None:
        self.uploads: dict[str, dict[int, bytes]] = {}
        self.objects: dict[str, bytes] = {}
        self.part_calls: list[int] = []
        self.cut_after: int | None = None
        self._next = 0

    def create_upload(self, key: str) -> str:
        self._next += 1
        upload_id = f"up-{self._next}"
        self.uploads[upload_id] = {}
        return upload_id

    def upload_part(self, key: str, upload_id: str, number: int, body: bytes) -> str:
        if self.cut_after is not None and len(self.part_calls) >= self.cut_after:
            raise ConnectionError("network down")
        if upload_id not in self.uploads:
            raise UploadGoneError(key)
        self.part_calls.append(number)
        self.uploads[upload_id][number] = body
        return f'"etag-{upload_id}-{number}"'

    def complete_upload(self, key: str, upload_id: str, parts: Sequence[Part]) -> None:
        stored = self.uploads.pop(upload_id)
        assert [p.number for p in parts] == sorted(stored)
        self.objects[key] = b"".join(stored[p.number] for p in parts)


def _settings(rate: int = 10 * PART) -> UploaderSettings:
    return UploaderSettings(
        endpoint_url="http://s3.test",  # type: ignore[arg-type]
        bucket="test-bucket",
        access_key_id="test-key",  # type: ignore[arg-type]
        secret_access_key="test-secret",  # type: ignore[arg-type]  # noqa: S106
        part_size_bytes=PART,
        bandwidth_limit_bytes_per_s=rate,
        chunk_bytes=CHUNK,
    )


def _segment(conn: sqlite3.Connection, tmp_path: Path, name: str, size: int) -> bytes:
    data = os.urandom(size)
    path = tmp_path / name
    path.write_bytes(data)
    record_segment(
        conn,
        camera="court-1-a",
        path=path,
        started_at=datetime(2026, 10, 17, 20, tzinfo=UTC),
        duration_s=10,
        size_bytes=size,
    )
    return data


@pytest.fixture
def conn(tmp_path: Path) -> sqlite3.Connection:
    return open_store(tmp_path / "edge.sqlite3")


def test_uploads_segment_in_parts(conn: sqlite3.Connection, tmp_path: Path) -> None:
    data = _segment(conn, tmp_path, "a.mp4", 2 * PART + 123)
    store, clock = FakeStore(), FakeClock()
    bucket = TokenBucket(10 * PART, CHUNK, clock=clock, sleep=clock.sleep)

    assert upload_pending(conn, store, _settings(), bucket)

    assert store.objects == {"segments/court-1-a/a.mp4": data}
    assert store.part_calls == [1, 2, 3]
    assert pending_segments(conn) == []


def test_resumes_after_network_cut_without_resending_parts(
    conn: sqlite3.Connection, tmp_path: Path
) -> None:
    data = _segment(conn, tmp_path, "a.mp4", 3 * PART + 7)
    store, clock = FakeStore(), FakeClock()
    bucket = TokenBucket(10 * PART, CHUNK, clock=clock, sleep=clock.sleep)
    store.cut_after = 2

    assert not upload_pending(conn, store, _settings(), bucket)
    assert store.objects == {}
    assert len(pending_segments(conn)) == 1

    # Network back, and a brand new process (fresh connection) picks it up.
    store.cut_after = None
    conn.close()
    conn2 = open_store(tmp_path / "edge.sqlite3")
    assert upload_pending(conn2, store, _settings(), bucket)

    assert store.part_calls == [1, 2, 3, 4]  # parts 1-2 were not sent again
    assert store.objects["segments/court-1-a/a.mp4"] == data
    assert pending_segments(conn2) == []


def test_restarts_when_store_forgot_the_upload(conn: sqlite3.Connection, tmp_path: Path) -> None:
    data = _segment(conn, tmp_path, "a.mp4", 2 * PART)
    store, clock = FakeStore(), FakeClock()
    bucket = TokenBucket(10 * PART, CHUNK, clock=clock, sleep=clock.sleep)
    store.cut_after = 1
    assert not upload_pending(conn, store, _settings(), bucket)

    store.cut_after = None
    store.uploads.clear()  # upload expired on the server
    assert upload_pending(conn, store, _settings(), bucket)
    assert store.objects["segments/court-1-a/a.mp4"] == data


@pytest.mark.parametrize("rate", [100_000, 187_500, 1_000_000])
def test_bandwidth_limit_is_respected_within_10_percent(
    conn: sqlite3.Connection, tmp_path: Path, rate: int
) -> None:
    size = 2 * PART + 999
    _segment(conn, tmp_path, "a.mp4", size)
    store, clock = FakeStore(), FakeClock()
    bucket = TokenBucket(rate, CHUNK, clock=clock, sleep=clock.sleep)

    assert upload_pending(conn, store, _settings(rate), bucket)

    expected = (size - CHUNK) / rate  # the initial burst goes out at once
    assert clock.now == pytest.approx(expected, rel=0.10)


def test_token_bucket_serves_requests_larger_than_burst() -> None:
    clock = FakeClock()
    bucket = TokenBucket(1000, 100, clock=clock, sleep=clock.sleep)
    bucket.take(100)
    assert clock.now == 0
    bucket.take(1000)
    assert clock.now == pytest.approx(1.0)


def test_token_bucket_rejects_bad_rate() -> None:
    with pytest.raises(ValueError, match="positive"):
        TokenBucket(0, 1)


def test_missing_file_is_skipped_and_queue_continues(
    conn: sqlite3.Connection, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    _segment(conn, tmp_path, "gone.mp4", 10)
    data = _segment(conn, tmp_path, "b.mp4", PART + 1)
    (tmp_path / "gone.mp4").unlink()
    store, clock = FakeStore(), FakeClock()
    bucket = TokenBucket(10 * PART, CHUNK, clock=clock, sleep=clock.sleep)

    with caplog.at_level(logging.INFO, logger="edge_agent.uploader"):
        assert not upload_pending(conn, store, _settings(), bucket)

    assert store.objects == {"segments/court-1-a/b.mp4": data}
    assert pending_segments(conn) == []
    reason = conn.execute("SELECT skipped_reason FROM uploads WHERE completed_at IS NULL")
    assert reason.fetchone() == ("FILE_MISSING",)
    assert "uploader_segment_missing" in caplog.text


def test_credentials_never_logged(
    conn: sqlite3.Connection, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    _segment(conn, tmp_path, "a.mp4", 2 * PART)
    store, clock = FakeStore(), FakeClock()
    bucket = TokenBucket(10 * PART, CHUNK, clock=clock, sleep=clock.sleep)
    settings = _settings()

    with caplog.at_level(logging.DEBUG):
        store.cut_after = 1
        upload_pending(conn, store, settings, bucket)
        store.cut_after = None
        upload_pending(conn, store, settings, bucket)

    assert caplog.records
    dumped = caplog.text + "".join(repr(r.__dict__) for r in caplog.records)
    assert "test-key" not in dumped
    assert "test-secret" not in dumped


def test_settings_hide_credentials() -> None:
    settings = _settings()
    assert "test-secret" not in repr(settings)
    assert "test-key" not in repr(settings)


def test_settings_reject_small_parts() -> None:
    with pytest.raises(ValueError, match="part_size_bytes"):
        UploaderSettings(
            endpoint_url="http://s3.test",  # type: ignore[arg-type]
            bucket="test-bucket",
            access_key_id="k",  # type: ignore[arg-type]
            secret_access_key="s",  # type: ignore[arg-type]  # noqa: S106
            part_size_bytes=1024,
        )
