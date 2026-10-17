"""End-to-end checks with the real tools. Each one skips, saying why, when a tool is missing.

They need FFmpeg/ffprobe and mediamtx (or Docker for the Compose file) on PATH; CI and
developer machines without them still run every other camsim test.
"""

import functools
import shutil
import socket
import subprocess
import threading
import time
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest

from edge_agent.camsim.cameras import Camera, cameras_for, stream_url
from edge_agent.camsim.ffmpeg import generate_testsrc, probe, publish_command
from edge_agent.camsim.state import set_running
from edge_agent.camsim.supervisor import Supervisor

REPO_ROOT = Path(__file__).resolve().parents[3]
COMPOSE_FILE = REPO_ROOT / "infra" / "camsim" / "docker-compose.yml"
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


def test_generates_synthetic_test_video(tmp_path: Path) -> None:
    tools = require("ffmpeg", "ffprobe")
    out = generate_testsrc(tools["ffmpeg"], tmp_path / "test.mp4", "320x240", 25, 2)

    result = subprocess.run(  # noqa: S603 - fixed argument list
        [tools["ffprobe"], "-v", "error", "-show_entries", "stream=codec_name,width", str(out)],
        capture_output=True,
        text=True,
        check=True,
    )
    assert "codec_name=h264" in result.stdout
    assert "width=320" in result.stdout
    assert not list(tmp_path.glob(".partial-*"))


@pytest.fixture
def rtsp_server(tmp_path: Path) -> Iterator[str]:
    tools = require("mediamtx")
    port = free_port()
    config = tmp_path / "mediamtx.yml"
    config.write_text(
        f"rtspAddress: 127.0.0.1:{port}\nrtmp: no\nhls: no\nwebrtc: no\nsrt: no\n"
        "paths:\n  all_others:\n",
        encoding="utf-8",
    )
    server = subprocess.Popen(  # noqa: S603 - fixed argument list
        [tools["mediamtx"], str(config)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        assert wait_until(lambda: port_open(port)), "mediamtx did not start"
        yield f"rtsp://127.0.0.1:{port}"
    finally:
        server.terminate()
        server.wait(timeout=10)


def test_publishes_every_camera_and_stops_one(tmp_path: Path, rtsp_server: str) -> None:
    tools = require("ffmpeg", "ffprobe")
    video = generate_testsrc(tools["ffmpeg"], tmp_path / "test.mp4", "320x240", 25, 2)
    cameras = cameras_for(1)
    commands = {
        c: publish_command(tools["ffmpeg"], video, stream_url(rtsp_server, c)) for c in cameras
    }
    state = tmp_path / "cameras.json"
    supervisor = Supervisor(commands, state)
    stop = threading.Event()
    runner = threading.Thread(target=supervisor.run, args=(stop, 0.2))
    runner.start()

    def up(camera: Camera) -> bool:
        return probe(tools["ffprobe"], stream_url(rtsp_server, camera), timeout_s=5) is not None

    try:
        for camera in cameras:
            assert wait_until(functools.partial(up, camera)), f"{camera.name} never came up"
        info = probe(tools["ffprobe"], stream_url(rtsp_server, cameras[0]))
        assert info is not None
        assert (info.codec, info.width, info.height) == ("h264", 320, 240)

        set_running(state, cameras[0], running=False)
        assert wait_until(lambda: not up(cameras[0])), "stopped camera is still published"
        assert up(cameras[1])

        set_running(state, cameras[0], running=True)
        assert wait_until(lambda: up(cameras[0])), "camera did not come back"
    finally:
        stop.set()
        runner.join(timeout=15)
    assert supervisor.running() == frozenset()


def test_compose_file_is_valid() -> None:
    tools = require("docker")
    result = subprocess.run(  # noqa: S603 - fixed argument list
        [tools["docker"], "compose", "-f", str(COMPOSE_FILE), "config", "--quiet"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0 and "is not a docker command" in result.stderr:
        pytest.skip("docker compose plugin not installed")
    assert result.returncode == 0, result.stderr
