import io
import json
import logging
from collections.abc import Iterator
from typing import Any

import pytest

from edge_agent.logs import REDACTED, configure_logging, is_sensitive, log_context


@pytest.fixture
def stream() -> Iterator[io.StringIO]:
    buffer = io.StringIO()
    root = logging.getLogger()
    saved_handlers, saved_level = root.handlers[:], root.level
    configure_logging("DEBUG", stream=buffer)
    yield buffer
    root.handlers[:] = saved_handlers
    root.setLevel(saved_level)


def last_line(stream: io.StringIO) -> dict[str, Any]:
    lines = stream.getvalue().strip().splitlines()
    result: dict[str, Any] = json.loads(lines[-1])
    return result


def test_writes_one_json_object_with_context_ids(stream: io.StringIO) -> None:
    with log_context(club_id="club-1"), log_context(match_id="match-9"):
        logging.getLogger("edge_agent.test").info("segment_saved", extra={"camera": 2})

    entry = last_line(stream)
    assert entry["msg"] == "segment_saved"
    assert entry["level"] == "INFO"
    assert entry["club_id"] == "club-1"
    assert entry["match_id"] == "match-9"
    assert entry["request_id"] is None
    assert entry["camera"] == 2
    assert entry["ts"].endswith("+00:00")


def test_context_is_cleared_after_the_block(stream: io.StringIO) -> None:
    with log_context(match_id="match-9"):
        pass
    logging.getLogger("edge_agent.test").info("idle")

    assert last_line(stream)["match_id"] is None


def test_sensitive_extra_fields_are_redacted(stream: io.StringIO) -> None:
    logging.getLogger("edge_agent.test").info(
        "upload_started",
        extra={"device_token": "abc123", "player_email": "x@example.com", "bytes": 10},
    )

    raw = stream.getvalue()
    entry = last_line(stream)
    assert entry["device_token"] == REDACTED
    assert entry["player_email"] == REDACTED
    assert entry["bytes"] == 10
    assert "abc123" not in raw
    assert "x@example.com" not in raw


@pytest.mark.parametrize("key", ["Authorization", "api_key", "PHONE", "dni", "full_name"])
def test_sensitive_keys(key: str) -> None:
    assert is_sensitive(key)


@pytest.mark.parametrize("key", ["club_id", "match_id", "camera", "bytes", "duration_ms"])
def test_safe_keys(key: str) -> None:
    assert not is_sensitive(key)


def test_unknown_context_key_is_rejected() -> None:
    with pytest.raises(ValueError, match="player"), log_context(player="someone"):
        pass
