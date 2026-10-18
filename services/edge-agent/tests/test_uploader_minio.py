"""Uploader against a real MinIO (S3-compatible) server.

MinIO is AGPL: it is only an external test service, never bundled or distributed.
Start one yourself (e.g. ``docker run -p 9000:9000 minio/minio server /data``) and set
``EDGE_TEST_MINIO_ENDPOINT`` (plus ``EDGE_TEST_MINIO_ACCESS_KEY`` / ``_SECRET_KEY`` if
not the local defaults). Skips when the variable is unset or MinIO does not answer.
"""

import os
import sqlite3
import time
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import pytest

from edge_agent.recorder.catalog import record_segment
from edge_agent.store import open_store
from edge_agent.uploader.cli import upload_pending
from edge_agent.uploader.multipart import Part
from edge_agent.uploader.ratelimit import TokenBucket
from edge_agent.uploader.s3 import S3ObjectStore, make_client
from edge_agent.uploader.settings import S3_MIN_PART_BYTES, UploaderSettings
from tests.tooling import port_open

# Read before the autouse fixture clears EDGE_* variables.
ENDPOINT = os.environ.get("EDGE_TEST_MINIO_ENDPOINT")
ACCESS_KEY = os.environ.get("EDGE_TEST_MINIO_ACCESS_KEY", "minioadmin")
SECRET_KEY = os.environ.get("EDGE_TEST_MINIO_SECRET_KEY", "minioadmin")
RATE = 4 * 1024 * 1024
CHUNK = 64 * 1024


class CuttableStore:
    """Real store whose network 'goes down' after N parts."""

    def __init__(self, inner: S3ObjectStore, cut_after: int | None) -> None:
        self.inner = inner
        self.cut_after = cut_after
        self.part_calls: list[int] = []

    def create_upload(self, key: str) -> str:
        return self.inner.create_upload(key)

    def upload_part(self, key: str, upload_id: str, number: int, body: bytes) -> str:
        if self.cut_after is not None and len(self.part_calls) >= self.cut_after:
            raise ConnectionError("network down")
        self.part_calls.append(number)
        return self.inner.upload_part(key, upload_id, number, body)

    def complete_upload(self, key: str, upload_id: str, parts: Sequence[Part]) -> None:
        self.inner.complete_upload(key, upload_id, parts)


@pytest.fixture
def minio_settings() -> UploaderSettings:
    if not ENDPOINT:
        pytest.skip("EDGE_TEST_MINIO_ENDPOINT not set")
    parts = urlsplit(ENDPOINT)
    if parts.hostname not in {"127.0.0.1", "localhost"} or not port_open(parts.port or 0):
        pytest.skip(f"MinIO not reachable at {ENDPOINT}")
    settings = UploaderSettings(
        endpoint_url=ENDPOINT,  # type: ignore[arg-type]
        bucket=f"edge-test-{uuid4().hex[:12]}",
        region="us-east-1",
        access_key_id=ACCESS_KEY,  # type: ignore[arg-type]
        secret_access_key=SECRET_KEY,  # type: ignore[arg-type]
        part_size_bytes=S3_MIN_PART_BYTES,
        bandwidth_limit_bytes_per_s=RATE,
        chunk_bytes=CHUNK,
    )
    make_client(settings).create_bucket(Bucket=settings.bucket)  # local MinIO only
    return settings


def test_resume_and_rate_limit_against_minio(
    minio_settings: UploaderSettings, tmp_path: Path
) -> None:
    client = make_client(minio_settings)
    data = os.urandom(3 * S3_MIN_PART_BYTES + 1234)
    path = tmp_path / "a.mp4"
    path.write_bytes(data)
    conn: sqlite3.Connection = open_store(tmp_path / "edge.sqlite3")
    record_segment(
        conn,
        camera="court-1-a",
        path=path,
        started_at=datetime(2026, 10, 17, 20, tzinfo=UTC),
        duration_s=10,
        size_bytes=len(data),
    )
    store = CuttableStore(S3ObjectStore(client, minio_settings.bucket), cut_after=2)
    bucket = TokenBucket(RATE, CHUNK)

    assert not upload_pending(conn, store, minio_settings, bucket)

    store.cut_after = None
    started = time.monotonic()
    assert upload_pending(conn, store, minio_settings, bucket)
    elapsed = time.monotonic() - started

    assert store.part_calls == [1, 2, 3, 4]
    body = client.get_object(Bucket=minio_settings.bucket, Key="segments/court-1-a/a.mp4")
    assert body["Body"].read() == data
    resent = len(data) - 2 * S3_MIN_PART_BYTES
    assert resent / elapsed <= RATE * 1.10
    assert resent / elapsed >= RATE * 0.80  # local network is far faster than the cap
