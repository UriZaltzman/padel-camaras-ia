"""Helpers for the integration tests that run the real tools (FFmpeg, mediamtx, Docker).

Each test calls ``require`` first: when a tool is missing it skips, saying which one.
"""

import shutil
import socket
import time
from collections.abc import Callable

import pytest

WAIT_S = 20.0


def require(*tools: str) -> dict[str, str]:
    found = {tool: shutil.which(tool) for tool in tools}
    missing = [tool for tool, path in found.items() if path is None]
    if missing:
        pytest.skip(f"{', '.join(missing)} not installed: install it to run this test")
    return {tool: path for tool, path in found.items() if path is not None}


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def port_open(port: int) -> bool:
    with socket.socket() as sock:
        return sock.connect_ex(("127.0.0.1", port)) == 0


def wait_until(condition: Callable[[], bool], timeout: float = WAIT_S) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.5)
    return False
