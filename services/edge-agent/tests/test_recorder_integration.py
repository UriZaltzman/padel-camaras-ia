"""Records the camera simulator with the real FFmpeg and mediamtx.

Skips, saying which tool is missing, when FFmpeg/ffprobe or mediamtx are not installed.
"""

import subprocess
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path

from pydantic import SecretStr

from edge_agent.camsim.cameras import Camera, stream_url
from edge_agent.camsim.ffmpeg import generate_testsrc, probe, publish_command
from edge_agent.recorder.catalog import spans_between
from edge_agent.recorder.continuity import find_gaps
from edge_agent.recorder.runner import Recorder
from edge_agent.store import open_store
from tests.tooling import require, wait_until

RECORD_S = 25.0


def test_records_simulated_camera_into_continuous_segments(
    tmp_path: Path, rtsp_server: str
) -> None:
    tools = require("ffmpeg", "ffprobe")
    video = generate_testsrc(tools["ffmpeg"], tmp_path / "test.mp4", "320x240", 25, 2)
    camera = Camera(1, "a")
    url = stream_url(rtsp_server, camera)
    publisher = subprocess.Popen(  # noqa: S603 - fixed argument list
        publish_command(tools["ffmpeg"], video, url), stdin=subprocess.DEVNULL
    )
    conn = open_store(tmp_path / "edge.sqlite3")
    try:
        assert wait_until(lambda: probe(tools["ffprobe"], url, timeout_s=5) is not None)
        recorder = Recorder(
            {camera.name: SecretStr(url)},
            tmp_path / "segments",
            conn,
            tools["ffmpeg"],
            desired=lambda _now: frozenset({camera.name}),
        )
        started = datetime.now(UTC)
        # SQLite connections belong to the thread that opened them: run on this thread
        # and let a timer stop it.
        stop = threading.Event()
        timer = threading.Timer(RECORD_S, stop.set)
        timer.start()
        try:
            recorder.run(stop, 0.5)
        finally:
            timer.cancel()

        spans = spans_between(conn, camera.name, started, datetime.now(UTC))
        assert len(spans) >= 2, spans
        assert find_gaps(spans, spans[0].start, spans[-1].end) == []
        assert all(span.duration_s <= 10.5 for span in spans)

        segments = sorted((tmp_path / "segments" / camera.name).glob("*.ts"))
        assert len(segments) == len(spans)
        result = subprocess.run(  # noqa: S603 - fixed argument list
            [
                tools["ffprobe"],
                "-v",
                "error",
                "-show_entries",
                "stream=codec_name,width",
                str(segments[0]),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        assert "codec_name=h264" in result.stdout  # copied, not re-encoded
        assert "width=320" in result.stdout
        assert spans[0].start >= started - timedelta(seconds=1)
    finally:
        conn.close()
        publisher.terminate()
        publisher.wait(timeout=10)
