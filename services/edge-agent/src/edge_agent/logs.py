"""JSON logs with ``request_id``, ``club_id`` and ``match_id``.

Never log personal data or tokens. As a safety net, any extra field whose name looks
sensitive is replaced with ``[REDACTED]`` before it is written.
"""

import json
import logging
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any, Final, TextIO

REDACTED: Final = "[REDACTED]"
SENSITIVE_KEY_PARTS: Final = (
    "token",
    "secret",
    "password",
    "authorization",
    "cookie",
    "api_key",
    "apikey",
    "private_key",
    "email",
    "phone",
    "dni",
    "cuit",
    "first_name",
    "last_name",
    "full_name",
    "player_name",
    "address",
)
CONTEXT_KEYS: Final = ("request_id", "club_id", "match_id")

_context: ContextVar[dict[str, str] | None] = ContextVar("edge_log_context", default=None)

# Attributes every LogRecord has; anything else came from ``extra=``.
_RESERVED_ATTRS: Final = frozenset(
    vars(logging.LogRecord("", logging.INFO, "", 0, "", None, None)).keys()
    | {"message", "asctime", "taskName"}
)


def is_sensitive(key: str) -> bool:
    lowered = key.lower()
    return any(part in lowered for part in SENSITIVE_KEY_PARTS)


def _current_context() -> dict[str, str]:
    return _context.get() or {}


@contextmanager
def log_context(**values: str | None) -> Iterator[None]:
    """Attach ``request_id`` / ``club_id`` / ``match_id`` to every log inside the block."""
    unknown = set(values) - set(CONTEXT_KEYS)
    if unknown:
        msg = f"Unknown log context keys: {sorted(unknown)}"
        raise ValueError(msg)
    merged = {**_current_context(), **{k: v for k, v in values.items() if v is not None}}
    token = _context.set(merged)
    try:
        yield
    finally:
        _context.reset(token)


class JsonFormatter(logging.Formatter):
    """One JSON object per line, timestamps in UTC."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        context = _current_context()
        for key in CONTEXT_KEYS:
            payload[key] = context.get(key)
        for key, value in vars(record).items():
            if key in _RESERVED_ATTRS or key in payload:
                continue
            payload[key] = REDACTED if is_sensitive(key) else value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def configure_logging(level: str = "INFO", stream: TextIO | None = None) -> None:
    """Send every log of the process to ``stream`` (stdout by default) as JSON."""
    handler = logging.StreamHandler(stream or sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
