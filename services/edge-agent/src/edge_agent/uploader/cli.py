"""``edge-uploader``: upload recorded segments to S3-compatible storage.

edge-uploader once   # upload everything pending, exit 1 if something failed
edge-uploader run    # keep uploading; after a network error wait and resume

Needs the agent settings (``EDGE_*``) plus ``EDGE_UPLOADER_*`` (endpoint, bucket, keys).
Access keys are never printed or logged.
"""

import argparse
import logging
import signal
import sqlite3
import sys
import threading
from collections.abc import Sequence
from types import FrameType
from typing import Final

from botocore.exceptions import BotoCoreError, ClientError

from edge_agent.logs import configure_logging
from edge_agent.settings import SettingsError, load_settings
from edge_agent.store import open_store
from edge_agent.uploader.multipart import (
    ObjectStore,
    mark_skipped,
    object_key,
    pending_segments,
    upload_segment,
)
from edge_agent.uploader.ratelimit import TokenBucket
from edge_agent.uploader.s3 import S3ObjectStore, make_client
from edge_agent.uploader.settings import UploaderSettings, load_uploader_settings

EXIT_OK: Final = 0
EXIT_ERROR: Final = 1
EXIT_CONFIG_ERROR: Final = 2

SKIP_FILE_MISSING: Final = "FILE_MISSING"
TRANSIENT_ERRORS: Final = (OSError, BotoCoreError, ClientError)

logger = logging.getLogger("edge_agent.uploader")


def upload_pending(
    conn: sqlite3.Connection,
    store: ObjectStore,
    settings: UploaderSettings,
    bucket: TokenBucket,
    stop: threading.Event | None = None,
) -> bool:
    """Upload every pending segment. Returns ``False`` if one failed (it resumes later)."""
    ok = True
    for segment in pending_segments(conn):
        if stop is not None and stop.is_set():
            break
        try:
            upload_segment(
                conn,
                store,
                segment,
                key_prefix=settings.key_prefix,
                part_size=settings.part_size_bytes,
                bucket=bucket,
                chunk_bytes=settings.chunk_bytes,
            )
        except FileNotFoundError:
            # Before OSError: a deleted file will not come back, the rest must go on.
            logger.error("uploader_segment_missing", extra={"segment_id": segment.id})
            mark_skipped(
                conn,
                segment,
                object_key(settings.key_prefix, segment),
                settings.part_size_bytes,
                SKIP_FILE_MISSING,
            )
            ok = False
        except TRANSIENT_ERRORS as error:
            # Type only: botocore messages are safe, but keep logs minimal.
            logger.warning(
                "uploader_segment_failed",
                extra={"segment_id": segment.id, "error": type(error).__name__},
            )
            ok = False
            break
    return ok


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="edge-uploader")
    parser.add_argument("command", choices=("once", "run"))
    args = parser.parse_args(argv)
    try:
        edge = load_settings()
        settings = load_uploader_settings()
    except SettingsError as error:
        print(error, file=sys.stderr)  # noqa: T201 - CLI output
        return EXIT_CONFIG_ERROR
    configure_logging(edge.log_level)
    store = S3ObjectStore(make_client(settings), settings.bucket)
    bucket = TokenBucket(settings.bandwidth_limit_bytes_per_s, settings.chunk_bytes)
    conn = open_store(edge.db_path)
    try:
        if args.command == "once":
            return EXIT_OK if upload_pending(conn, store, settings, bucket) else EXIT_ERROR
        stop = threading.Event()

        def _request_stop(signum: int, _frame: FrameType | None) -> None:
            logger.info("uploader_stopping", extra={"signal": signum})
            stop.set()

        signal.signal(signal.SIGTERM, _request_stop)
        signal.signal(signal.SIGINT, _request_stop)
        logger.info("uploader_started")
        while not stop.is_set():
            ok = upload_pending(conn, store, settings, bucket, stop)
            stop.wait(settings.poll_interval_s if ok else settings.retry_interval_s)
        return EXIT_OK
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
