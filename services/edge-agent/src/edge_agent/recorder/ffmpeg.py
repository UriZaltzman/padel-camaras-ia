"""FFmpeg/ffprobe command lines for the recorder.

The stream is copied as the camera sends it (``-c copy``): no re-encoding, almost no
CPU, and the original quality. The 2560x1440 / 25 fps profile is configured on the
camera; ``probe`` checks it.
"""

import json
import subprocess
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Final

from edge_agent.recorder.segments import SEGMENT_SECONDS, segment_pattern

EXPECTED_WIDTH: Final = 2560
EXPECTED_HEIGHT: Final = 1440
EXPECTED_FPS: Final = 25
# FFmpeg gives up (and the recorder restarts it) when the camera sends nothing for 5 s.
RTSP_IO_TIMEOUT_US: Final = 5_000_000
PROBE_TIMEOUT_S: Final = 10.0
FPS_TOLERANCE: Final = 0.5


def record_command(ffmpeg: str, url: str, camera: str, out_dir: Path, list_path: Path) -> list[str]:
    """Copy the first video track of ``url`` into 10 s MPEG-TS segments in ``out_dir``.

    Segments are cut at wall-clock multiples of 10 s (on the first keyframe after each
    boundary), named after the UTC second they open (run FFmpeg with ``TZ=UTC``), and
    each closed segment is appended to ``list_path`` as ``filename,start,end``.
    """
    return [
        ffmpeg,
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "warning",
        "-rtsp_transport",
        "tcp",
        "-timeout",
        str(RTSP_IO_TIMEOUT_US),
        "-i",
        url,
        "-map",
        "0:v:0",
        "-c",
        "copy",
        "-f",
        "segment",
        "-segment_time",
        str(SEGMENT_SECONDS),
        "-segment_atclocktime",
        "1",
        "-segment_format",
        "mpegts",
        "-reset_timestamps",
        "1",
        "-strftime",
        "1",
        "-segment_list",
        str(list_path),
        "-segment_list_type",
        "csv",
        str(out_dir / segment_pattern(camera)),
    ]


@dataclass(frozen=True)
class StreamProfile:
    codec: str
    width: int
    height: int
    fps: float


def probe_command(ffprobe: str, url: str) -> list[str]:
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
        "stream=codec_name,width,height,r_frame_rate",
        "-of",
        "json",
        url,
    ]


def parse_probe_output(raw: str) -> StreamProfile | None:
    """``StreamProfile`` from ffprobe's JSON, or ``None`` when there is no video track."""
    try:
        first = (json.loads(raw).get("streams") or [])[0]
        fps = float(Fraction(str(first["r_frame_rate"])))
        return StreamProfile(
            str(first["codec_name"]), int(first["width"]), int(first["height"]), fps
        )
    except (ValueError, LookupError, TypeError, AttributeError, ZeroDivisionError):
        return None


def profile_problems(profile: StreamProfile) -> list[str]:
    """How ``profile`` differs from the 2560x1440 at 25 fps the spec asks for."""
    problems = []
    if (profile.width, profile.height) != (EXPECTED_WIDTH, EXPECTED_HEIGHT):
        problems.append(
            f"size {profile.width}x{profile.height}, expected {EXPECTED_WIDTH}x{EXPECTED_HEIGHT}"
        )
    if abs(profile.fps - EXPECTED_FPS) > FPS_TOLERANCE:
        problems.append(f"{profile.fps:g} fps, expected {EXPECTED_FPS}")
    return problems


def probe(ffprobe: str, url: str, timeout_s: float = PROBE_TIMEOUT_S) -> StreamProfile | None:
    """Read ``url`` with ffprobe. ``None`` means the camera did not answer."""
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
