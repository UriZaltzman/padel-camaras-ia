import subprocess
from pathlib import Path

import pytest

from edge_agent.camsim import ffmpeg
from edge_agent.camsim.cameras import Camera
from edge_agent.camsim.ffmpeg import (
    FfmpegNotFoundError,
    StreamInfo,
    find_binary,
    parse_probe_output,
    probe_command,
    publish_command,
    recorded_video_for,
)


def test_publish_loops_in_real_time_without_reencoding() -> None:
    command = publish_command("/usr/bin/ffmpeg", Path("/videos/a.mp4"), "rtsp://m:8554/court-1-a")

    joined = " ".join(command)
    assert command[0] == "/usr/bin/ffmpeg"
    assert "-re" in command
    assert "-stream_loop -1" in joined
    assert "-c copy" in joined
    assert "-f rtsp -rtsp_transport tcp" in joined
    assert command[-1] == "rtsp://m:8554/court-1-a"


def test_testsrc_uses_lavfi_with_one_keyframe_per_second() -> None:
    command = ffmpeg.testsrc_command("ffmpeg", Path("out.mp4"), "2560x1440", 25, 10)

    joined = " ".join(command)
    assert "-f lavfi -i testsrc=size=2560x1440:rate=25" in joined
    assert "-t 10" in joined
    assert "-c:v libx264" in joined
    assert "-g 25" in joined
    assert command[-1] == "out.mp4"


def test_testsrc_filename_changes_with_parameters() -> None:
    assert ffmpeg.testsrc_filename("1280x720", 25, 10) == "testsrc-1280x720-25fps-10s.mp4"
    assert ffmpeg.testsrc_filename("1280x720", 30, 10) != ffmpeg.testsrc_filename(
        "1280x720", 25, 10
    )


def test_recorded_video_prefers_camera_then_default(tmp_path: Path) -> None:
    camera = Camera(1, "a")
    assert recorded_video_for(camera, tmp_path) is None
    assert recorded_video_for(camera, tmp_path / "missing") is None

    (tmp_path / "default.mp4").write_bytes(b"")
    assert recorded_video_for(camera, tmp_path) == tmp_path / "default.mp4"

    (tmp_path / "court-1-a.mp4").write_bytes(b"")
    assert recorded_video_for(camera, tmp_path) == tmp_path / "court-1-a.mp4"
    assert recorded_video_for(Camera(1, "b"), tmp_path) == tmp_path / "default.mp4"


def test_missing_binary_names_the_variable() -> None:
    with pytest.raises(FfmpegNotFoundError, match="CAMSIM_FFPROBE_BIN"):
        find_binary("definitely-not-ffmpeg-xyz", env_var="CAMSIM_FFPROBE_BIN")


def test_probe_command_reads_first_video_track_over_tcp() -> None:
    command = probe_command("ffprobe", "rtsp://m:8554/court-1-a")

    joined = " ".join(command)
    assert "-rtsp_transport tcp" in joined
    assert "-select_streams v:0" in joined
    assert "-of json" in joined
    assert command[-1] == "rtsp://m:8554/court-1-a"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (
            '{"streams": [{"codec_name": "h264", "width": 2560, "height": 1440}]}',
            StreamInfo("h264", 2560, 1440),
        ),
        ('{"streams": []}', None),
        ("{}", None),
        ('{"streams": [{"codec_name": "h264"}]}', None),
        ("not json", None),
        ("[]", None),
    ],
)
def test_parse_probe_output(raw: str, expected: StreamInfo | None) -> None:
    assert parse_probe_output(raw) == expected


def test_probe_treats_errors_and_timeouts_as_down(monkeypatch: pytest.MonkeyPatch) -> None:
    def failing(*_args: object, **_kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess([], 1, stdout="", stderr="404 Not Found")

    def hanging(*_args: object, **_kwargs: object) -> subprocess.CompletedProcess[str]:
        raise subprocess.TimeoutExpired("ffprobe", 1)

    def working(*_args: object, **_kwargs: object) -> subprocess.CompletedProcess[str]:
        out = '{"streams": [{"codec_name": "h264", "width": 320, "height": 240}]}'
        return subprocess.CompletedProcess([], 0, stdout=out, stderr="")

    monkeypatch.setattr(subprocess, "run", failing)
    assert ffmpeg.probe("ffprobe", "rtsp://x/court-1-a") is None
    monkeypatch.setattr(subprocess, "run", hanging)
    assert ffmpeg.probe("ffprobe", "rtsp://x/court-1-a") is None
    monkeypatch.setattr(subprocess, "run", working)
    assert ffmpeg.probe("ffprobe", "rtsp://x/court-1-a") == StreamInfo("h264", 320, 240)
