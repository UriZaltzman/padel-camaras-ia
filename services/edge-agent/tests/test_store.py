import sqlite3
from pathlib import Path

import pytest

from edge_agent.store import MIGRATIONS, get_state, open_store, schema_version, set_state


def test_creates_store_and_parent_dirs(tmp_path: Path) -> None:
    path = tmp_path / "nested" / "edge.sqlite3"

    conn = open_store(path)
    try:
        assert path.exists()
        assert schema_version(conn) == len(MIGRATIONS)
        assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    finally:
        conn.close()


def test_reopening_keeps_data_and_does_not_rerun_migrations(tmp_path: Path) -> None:
    path = tmp_path / "edge.sqlite3"
    conn = open_store(path)
    set_state(conn, "last_sync", "2026-10-17T12:00:00Z")
    conn.close()

    conn = open_store(path)
    try:
        assert get_state(conn, "last_sync") == "2026-10-17T12:00:00Z"
        assert schema_version(conn) == len(MIGRATIONS)
    finally:
        conn.close()


def test_set_state_overwrites(tmp_path: Path) -> None:
    conn = open_store(tmp_path / "edge.sqlite3")
    try:
        set_state(conn, "k", "1")
        set_state(conn, "k", "2")
        assert get_state(conn, "k") == "2"
        assert get_state(conn, "missing") is None
    finally:
        conn.close()


def test_refuses_store_from_a_newer_agent(tmp_path: Path) -> None:
    path = tmp_path / "edge.sqlite3"
    raw = sqlite3.connect(path)
    raw.execute(f"PRAGMA user_version = {len(MIGRATIONS) + 1}")
    raw.close()

    with pytest.raises(RuntimeError, match="newer"):
        open_store(path)
