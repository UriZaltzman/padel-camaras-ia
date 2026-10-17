"""Local SQLite store shared by the agent processes.

It survives power cuts (WAL + synchronous=FULL) and migrates itself on open using
``PRAGMA user_version``. Migrations are append-only: never edit one that shipped.
"""

import sqlite3
from pathlib import Path
from typing import Final

BUSY_TIMEOUT_MS: Final = 5_000

MIGRATIONS: Final[tuple[str, ...]] = (
    # 1: key/value state for each process (last sync, cursors, versions).
    """
    CREATE TABLE agent_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ) STRICT;
    """,
)


def schema_version(conn: sqlite3.Connection) -> int:
    row = conn.execute("PRAGMA user_version").fetchone()
    return int(row[0])


def _migrate(conn: sqlite3.Connection) -> None:
    current = schema_version(conn)
    if current > len(MIGRATIONS):
        msg = f"Store schema v{current} is newer than this agent (v{len(MIGRATIONS)})"
        raise RuntimeError(msg)
    for version, sql in enumerate(MIGRATIONS[current:], start=current + 1):
        # One transaction per migration: the schema and its version move together.
        conn.executescript(f"BEGIN;\n{sql}\nPRAGMA user_version = {version};\nCOMMIT;")


def open_store(path: Path) -> sqlite3.Connection:
    """Open (creating if needed) the store at ``path`` and bring its schema up to date."""
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=BUSY_TIMEOUT_MS / 1000)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = FULL")
        conn.execute("PRAGMA foreign_keys = ON")
        _migrate(conn)
    except Exception:
        conn.close()
        raise
    return conn


def set_state(conn: sqlite3.Connection, key: str, value: str) -> None:
    with conn:
        conn.execute(
            """
            INSERT INTO agent_state (key, value) VALUES (?, ?)
            ON CONFLICT (key) DO UPDATE SET
                value = excluded.value,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            """,
            (key, value),
        )


def get_state(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("SELECT value FROM agent_state WHERE key = ?", (key,)).fetchone()
    return None if row is None else str(row[0])
