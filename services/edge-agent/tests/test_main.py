import json
import logging
from collections.abc import Iterator
from pathlib import Path

import pytest

from edge_agent.__main__ import EXIT_CONFIG_ERROR, main
from edge_agent.settings import DB_FILENAME
from edge_agent.store import get_state, open_store

from .conftest import CLUB_ID, DEVICE_ID


@pytest.fixture(autouse=True)
def restore_root_logger() -> Iterator[None]:
    root = logging.getLogger()
    saved_handlers, saved_level = root.handlers[:], root.level
    yield
    root.handlers[:] = saved_handlers
    root.setLevel(saved_level)


def test_refuses_to_start_without_required_variable(
    valid_env: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv("EDGE_API_BASE_URL")

    assert main() == EXIT_CONFIG_ERROR
    assert "EDGE_API_BASE_URL: missing" in capsys.readouterr().err
    assert not (valid_env / DB_FILENAME).exists()


def test_starts_creates_store_and_logs_json(
    valid_env: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main() == 0

    entry = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert entry["msg"] == "edge_agent_started"
    assert entry["club_id"] == CLUB_ID
    assert entry["device_id"] == DEVICE_ID
    conn = open_store(valid_env / DB_FILENAME)
    try:
        assert get_state(conn, "agent_version") is not None
    finally:
        conn.close()
