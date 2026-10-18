"""Small local HTTP server: serves the page, the video (with byte ranges) and a JSON API.

Standard library only. It binds to the loopback address from ``labeling.yaml`` and serves a
single labeler; it is not meant to be exposed on a network.
"""

from __future__ import annotations

import json
import logging
import mimetypes
import re
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from typing import Any

from pydantic import ValidationError

from ml.labeling.actions import ActionRequest, SaveTarget, apply_action, session_state
from ml.labeling.config import LabelingConfig
from ml.labeling.session import LabelingError, LabelingSession
from ml.labels import LabelSetExistsError

logger = logging.getLogger(__name__)

_PACKAGE_DIR = Path(__file__).resolve().parent
INDEX_PATH = _PACKAGE_DIR / "static" / "index.html"
LOCALE_PATH = _PACKAGE_DIR / "locales" / "es-AR.json"
_RANGE = re.compile(r"bytes=(?P<start>\d*)-(?P<end>\d*)")


@dataclass
class App:
    session: LabelingSession
    config: LabelingConfig
    video_path: Path
    target: SaveTarget
    lock: Lock


def _client_config(app: App) -> dict[str, Any]:
    return {
        "timeline": app.config.timeline.model_dump(),
        "shortcuts": [s.model_dump(mode="json") for s in app.config.shortcuts],
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
            self._send(status, json.dumps(payload).encode(), "application/json")

        def _error(self, status: HTTPStatus, code: str, detail: str) -> None:
            logger.warning("labeling request rejected: %s %s", code, detail)
            with app.lock:
                state = session_state(app.session)
            self._json({"error": code, "state": state}, status)

        def do_GET(self) -> None:
            if self.path == "/":
                self._send(HTTPStatus.OK, INDEX_PATH.read_bytes(), "text/html; charset=utf-8")
            elif self.path == "/api/config":
                self._json(_client_config(app))
            elif self.path == "/api/state":
                with app.lock:
                    self._json(session_state(app.session))
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
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                msg = "body must be a JSON object"
                raise TypeError(msg)
            return body

        def do_POST(self) -> None:
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
                    state = session_state(app.session)
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
