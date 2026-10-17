"""FFmpeg command lines: publish a video as RTSP and generate a synthetic test video.

FFmpeg always runs as a separate process; the agent never links against it.
"""

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from edge_agent.camsim.cameras import Camera

DEFAULT_VIDEO_NAME: Final = "default.mp4"
VIDEO_SUFFIX: Final = ".mp4"
PROBE_TIMEOUT_S: Final = 10.0


class FfmpegNotFoundError(Exception):
    """The FFmpeg binary is not installed or not on PATH."""


def find_binary(name: str, env_var: str = "CAMSIM_FFMPEG_BIN") -> str:
    path = shutil.which(name)
    if path is None:
        msg = f"{name} not found: install FFmpeg or set {env_var}"
        raise FfmpegNotFoundError(msg)
    return path


def publish_command(ffmpeg: str, video: Path, url: str) -> list[str]:
    """Loop ``video`` forever at real-time speed and push it to ``url`` without re-encoding.

    Without re-encoding, the recorder receives exactly what a real camera would send
    (H.264/H.265) and 8 cameras cost almost no CPU. Only the first video track is sent.
    """
    return [
        ffmpeg,
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-re",
        "-stream_loop",
        "-1",
        "-i",
        str(video),
        "-map",
        "0:v:0",
        "-c",
        "copy",
        "-f",
        "rtsp",
        "-rtsp_transport",
        "tcp",
        url,
    ]


def testsrc_command(ffmpeg: str, out: Path, size: str, fps: int, seconds: int) -> list[str]:
    """H.264 test pattern with one keyframe per second, like a camera's stream."""
    return [
        ffmpeg,
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"testsrc=size={size}:rate={fps}",
        "-t",
        str(seconds),
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-g",
        str(fps),
        "-movflags",
        "+faststart",
        str(out),
    ]


def testsrc_filename(size: str, fps: int, seconds: int) -> str:
    """Cache key for the generated video: changing a parameter generates a new one."""
    return f"testsrc-{size}-{fps}fps-{seconds}s{VIDEO_SUFFIX}"


def generate_testsrc(ffmpeg: str, out: Path, size: str, fps: int, seconds: int) -> Path:
    """Write a synthetic test video to ``out`` (atomically) and return its path."""
    out.parent.mkdir(parents=True, exist_ok=True)
    partial = out.with_name(f".partial-{out.name}")
    subprocess.run(  # noqa: S603 - fixed argument list, no shell
        testsrc_command(ffmpeg, partial, size, fps, seconds),
        check=True,
        stdin=subprocess.DEVNULL,
    )
    partial.replace(out)
    return out


def recorded_video_for(camera: Camera, video_dir: Path) -> Path | None:
    """``<video_dir>/<camera>.mp4``, else ``<video_dir>/default.mp4``, else ``None``."""
    for candidate in (video_dir / f"{camera.name}{VIDEO_SUFFIX}", video_dir / DEFAULT_VIDEO_NAME):
        if candidate.is_file():
            return candidate
    return None


@dataclass(frozen=True)
class StreamInfo:
    codec: str
    width: int
    height: int


def probe_command(ffprobe: str, url: str) -> list[str]:
    """Ask ``ffprobe`` for the codec and size of the first video track of ``url``."""
    return [
        ffprobe,
        "-hide_banner",
        "-loglevel",
        "error",
        "-rtsp_transport",
        "tcp",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,width,height",
        "-of",
        "json",
        url,
    ]


def parse_probe_output(raw: str) -> StreamInfo | None:
    """``StreamInfo`` from ffprobe's JSON, or ``None`` when it found no video track."""
    try:
        streams = json.loads(raw).get("streams") or []
        first = streams[0]
        return StreamInfo(str(first["codec_name"]), int(first["width"]), int(first["height"]))
    except (ValueError, LookupError, TypeError, AttributeError):
        return None


def probe(ffprobe: str, url: str, timeout_s: float = PROBE_TIMEOUT_S) -> StreamInfo | None:
    """Read ``url`` with ffprobe. ``None`` means the stream is not being published."""
    try:
        result = subprocess.run(  # noqa: S603 - fixed argument list, no shell
            probe_command(ffprobe, url),
            capture_output=True,
            text=True,
            timeout=timeout_s,
            stdin=subprocess.DEVNULL,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return None
    if result.returncode != 0:
        return None
    return parse_probe_output(result.stdout)
