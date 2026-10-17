"""Desired state of each camera, shared between the CLI and the running simulator.

Only stopped cameras are stored, so cameras of newly added courts start running. The
file is replaced atomically and writers hold a lock, so the simulator never reads half
a file and two CLI calls never lose each other's change.
"""

import fcntl
import json
import os
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from edge_agent.camsim.cameras import Camera


class StateFileError(Exception):
    """The state file exists but cannot be understood."""


def read_stopped(path: Path) -> frozenset[Camera]:
    """Cameras marked as stopped. A missing file means every camera runs."""
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return frozenset()
    try:
        data = json.loads(raw)
        names = data["stopped"]
        if not isinstance(names, list):
            msg = "'stopped' must be a list"
            raise TypeError(msg)
        return frozenset(Camera.parse(str(name)) for name in names)
    except (ValueError, KeyError, TypeError) as error:
        msg = f"Unreadable camera state file {path}: {error}"
        raise StateFileError(msg) from error


@contextmanager
def _locked(path: Path) -> Iterator[None]:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_name(f"{path.name}.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def _write(path: Path, stopped: frozenset[Camera]) -> None:
    payload = json.dumps({"stopped": [camera.name for camera in sorted(stopped)]}, indent=2)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(payload + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        Path(tmp).replace(path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def set_running(path: Path, camera: Camera, *, running: bool) -> bool:
    """Mark ``camera`` as running or stopped. Returns whether anything changed."""
    with _locked(path):
        stopped = read_stopped(path)
        updated = stopped - {camera} if running else stopped | {camera}
        if updated == stopped:
            return False
        _write(path, updated)
        return True
