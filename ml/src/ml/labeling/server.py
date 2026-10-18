"""Small local HTTP server: serves the page, the video (with byte ranges) and a JSON API.

Standard library only. It binds to the loopback address from ``labeling.yaml`` and serves a
single labeler; it is not meant to be exposed on a network.
"""

from __future__ import annotations

import json
import logging
import mimetypes
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from typing import Any, cast

from pydantic import ValidationError

from ml.labeling.actions import ActionRequest, SaveTarget, apply_action, session_state
from ml.labeling.config import (
    LOOPBACK_HOST_NAMES,
    POINTS_MODE_ACTIONS,
    SHOT_TYPE_MODE_ACTIONS,
    LabelingConfig,
)
from ml.labeling.session import LabelingError, LabelingSession
from ml.labels import LabelSetExistsError
from ml.schemas import ShotType
from ml.thresholds import ScoringRules, load_thresholds

logger = logging.getLogger(__name__)

_PACKAGE_DIR = Path(__file__).resolve().parent
INDEX_PATH = _PACKAGE_DIR / "static" / "index.html"
LOCALE_PATH = _PACKAGE_DIR / "locales" / "es-AR.json"
JSON_CONTENT_TYPE = "application/json"
_RANGE = re.compile(r"bytes=(?P<start>\d*)-(?P<end>\d*)")


@dataclass
class App:
    session: LabelingSession
    config: LabelingConfig
    video_path: Path
    target: SaveTarget
    lock: Lock
    other_counts: Mapping[ShotType, int] = field(default_factory=dict)
    """Shot types already stored for other matches (progress against the goal)."""
    scoring: ScoringRules = field(default_factory=lambda: load_thresholds().scoring)
    """Scoring rules from thresholds.yaml, to show the score rebuilt from the points."""


def _client_config(app: App) -> dict[str, Any]:
    return {
        "timeline": app.config.timeline.model_dump(),
        "shortcuts": [s.model_dump(mode="json") for s in app.config.shortcuts],
        "shot_type": app.config.shot_type.model_dump(mode="json"),
        "shot_type_mode_actions": sorted(a.value for a in SHOT_TYPE_MODE_ACTIONS),
        "points": app.config.points.model_dump(mode="json"),
        "points_mode_actions": sorted(a.value for a in POINTS_MODE_ACTIONS),
        "texts": json.loads(LOCALE_PATH.read_text(encoding="utf-8")),
        "video_name": app.video_path.name,
    }


def make_handler(app: App) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: object) -> None:  # noqa: A002
            logger.debug(format, *args)

        def _send(self, status: HTTPStatus, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
            self._send(status, json.dumps(payload).encode(), JSON_CONTENT_TYPE)

        def _error(self, status: HTTPStatus, code: str, detail: str) -> None:
            logger.warning("labeling request rejected: %s %s", code, detail)
            with app.lock:
                state = session_state(app.session, app.other_counts, app.scoring)
            self._json({"error": code, "state": state}, status)

        def _allowed_hosts(self) -> set[str]:
            port = cast("HTTPServer", self.server).server_port
            return {f"{name}:{port}" for name in LOOPBACK_HOST_NAMES}

        def _rejected(self, *, post: bool) -> bool:
            """Block DNS rebinding (foreign Host) and cross-site requests (CSRF)."""
            hosts = self._allowed_hosts()
            origin = self.headers.get("Origin")
            content_type = self.headers.get("Content-Type", "").split(";")[0].strip()
            if self.headers.get("Host") not in hosts:
                reason = "LABEL_FORBIDDEN_HOST"
            elif origin is not None and origin not in {f"http://{host}" for host in hosts}:
                reason = "LABEL_FORBIDDEN_ORIGIN"
            elif post and content_type != JSON_CONTENT_TYPE:
                reason = "LABEL_UNSUPPORTED_MEDIA_TYPE"
            else:
                return False
            logger.warning("labeling request blocked: %s", reason)
            self._send(
                HTTPStatus.FORBIDDEN, json.dumps({"error": reason}).encode(), JSON_CONTENT_TYPE
            )
            return True

        def do_GET(self) -> None:
            if self._rejected(post=False):
                return
            if self.path == "/":
                self._send(HTTPStatus.OK, INDEX_PATH.read_bytes(), "text/html; charset=utf-8")
            elif self.path == "/api/config":
                self._json(_client_config(app))
            elif self.path == "/api/state":
                with app.lock:
                    self._json(session_state(app.session, app.other_counts, app.scoring))
            elif self.path == "/video":
                self._video()
            else:
                self._send(HTTPStatus.NOT_FOUND, b"", "text/plain")

        def _video(self) -> None:
            size = app.video_path.stat().st_size
            content_type = mimetypes.guess_type(app.video_path.name)[0] or "video/mp4"
            start, end = 0, size - 1
            match = _RANGE.fullmatch(self.headers.get("Range", ""))
            if match and (match["start"] or match["end"]):
                if match["start"]:
                    start = int(match["start"])
                    end = min(int(match["end"]), end) if match["end"] else end
                else:
                    start = max(size - int(match["end"]), 0)
                if start > end:
                    self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.end_headers()
                    return
                self.send_response(HTTPStatus.PARTIAL_CONTENT)
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            else:
                self.send_response(HTTPStatus.OK)
            length = end - start + 1
            self.send_header("Content-Type", content_type)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(length))
            self.end_headers()
            chunk = app.config.server.video_chunk_bytes
            with app.video_path.open("rb") as file:
                file.seek(start)
                while length > 0:
                    data = file.read(min(chunk, length))
                    if not data:
                        break
                    try:
                        self.wfile.write(data)
                    except (BrokenPipeError, ConnectionResetError):
                        return
                    length -= len(data)

        def _body(self) -> dict[str, Any]:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 <= length <= app.config.server.max_body_bytes:
                msg = f"body of {length} bytes is over the limit"
                raise ValueError(msg)
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                msg = "body must be a JSON object"
                raise TypeError(msg)
            return body

        def do_POST(self) -> None:
            if self._rejected(post=True):
                return
            try:
                body = self._body()
                with app.lock:
                    if self.path == "/api/duration":
                        app.session.set_duration(int(body["duration_ms"]))
                        saved = None
                    elif self.path == "/api/action":
                        request = ActionRequest.model_validate(body)
                        saved = apply_action(
                            app.session, request, app.config.timeline.nudge_step_ms, app.target
                        )
                    else:
                        self._send(HTTPStatus.NOT_FOUND, b"", "text/plain")
                        return
                    state = session_state(app.session, app.other_counts, app.scoring)
            except LabelingError as error:
                self._error(HTTPStatus.CONFLICT, error.code.value, str(error))
                return
            except LabelSetExistsError as error:
                self._error(HTTPStatus.CONFLICT, "LABEL_SET_EXISTS", str(error))
                return
            except (ValidationError, ValueError, KeyError, TypeError) as error:
                self._error(HTTPStatus.BAD_REQUEST, "LABEL_BAD_REQUEST", str(error))
                return
            if saved is not None:
                logger.info("label set saved: %s", saved)
                state["saved_to"] = str(saved)
            self._json(state)

    return Handler


def serve(app: App) -> None:
    """Serve until interrupted."""
    server = ThreadingHTTPServer(
        (app.config.server.host, app.config.server.port), make_handler(app)
    )
    try:
        server.serve_forever()
    finally:
        server.server_close()
