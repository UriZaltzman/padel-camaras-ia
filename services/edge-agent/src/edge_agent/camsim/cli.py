"""``edge-camsim``: run the camera simulator and stop/start cameras from the command line.

edge-camsim run                       # publish every camera until SIGTERM/Ctrl+C
edge-camsim list                      # cameras, desired state and RTSP URL
edge-camsim stop court-1-a            # simulate a camera going down
edge-camsim start court-1-a           # bring it back
edge-camsim probe                     # ffprobe every camera; exit 1 if one is not as expected
edge-camsim generate-test-video out.mp4 --size 1280x720 --seconds 10
"""

import argparse
import logging
import signal
import subprocess
import sys
import threading
from collections.abc import Sequence
from pathlib import Path
from types import FrameType
from typing import Final, TextIO

from edge_agent.camsim.cameras import Camera, cameras_for, stream_url
from edge_agent.camsim.ffmpeg import (
    FfmpegNotFoundError,
    find_binary,
    generate_testsrc,
    probe,
    publish_command,
    recorded_video_for,
    testsrc_filename,
)
from edge_agent.camsim.settings import SimulatorSettings, load_simulator_settings
from edge_agent.camsim.state import StateFileError, read_stopped, set_running
from edge_agent.camsim.supervisor import Supervisor
from edge_agent.logs import configure_logging
from edge_agent.settings import SettingsError

EXIT_OK: Final = 0
EXIT_ERROR: Final = 1
EXIT_CONFIG_ERROR: Final = 2

logger = logging.getLogger("edge_agent.camsim")


def plan_videos(cameras: Sequence[Camera], video_dir: Path, fallback: Path) -> dict[Camera, Path]:
    """Video each camera replays: its own recording, the shared default, or ``fallback``."""
    return {camera: recorded_video_for(camera, video_dir) or fallback for camera in cameras}


def build_commands(
    settings: SimulatorSettings, ffmpeg: str, videos: dict[Camera, Path]
) -> dict[Camera, list[str]]:
    return {
        camera: publish_command(ffmpeg, video, stream_url(settings.rtsp_url, camera))
        for camera, video in videos.items()
    }


def _ensure_testsrc(settings: SimulatorSettings, ffmpeg: str) -> Path:
    size, fps, seconds = (
        settings.test_video_size,
        settings.test_video_fps,
        settings.test_video_seconds,
    )
    path = settings.state_dir / testsrc_filename(size, fps, seconds)
    if not path.is_file():
        logger.info("camsim_generating_test_video", extra={"path": str(path)})
        generate_testsrc(ffmpeg, path, size, fps, seconds)
    return path


def _run(settings: SimulatorSettings) -> int:
    configure_logging(settings.log_level)
    ffmpeg = find_binary(settings.ffmpeg_bin)
    cameras = cameras_for(settings.courts)
    fallback = settings.state_dir / testsrc_filename(
        settings.test_video_size, settings.test_video_fps, settings.test_video_seconds
    )
    videos = plan_videos(cameras, settings.video_dir, fallback)
    if fallback in videos.values():
        _ensure_testsrc(settings, ffmpeg)
    supervisor = Supervisor(build_commands(settings, ffmpeg, videos), settings.state_path)

    stop = threading.Event()

    def _request_stop(signum: int, _frame: FrameType | None) -> None:
        logger.info("camsim_stopping", extra={"signal": signum})
        stop.set()

    signal.signal(signal.SIGTERM, _request_stop)
    signal.signal(signal.SIGINT, _request_stop)
    for camera in cameras:
        logger.info(
            "camsim_camera_configured",
            extra={
                "camera": camera.name,
                "video": str(videos[camera]),
                "url": stream_url(settings.reader_rtsp_url, camera),
            },
        )
    supervisor.run(stop)
    logger.info("camsim_stopped")
    return EXIT_OK


def _list(settings: SimulatorSettings, out: TextIO) -> int:
    stopped = read_stopped(settings.state_path)
    for camera in cameras_for(settings.courts):
        state = "stopped" if camera in stopped else "running"
        out.write(f"{camera.name}\t{state}\t{stream_url(settings.reader_rtsp_url, camera)}\n")
    return EXIT_OK


def _set(settings: SimulatorSettings, name: str, *, running: bool, out: TextIO) -> int:
    camera = Camera.parse(name)
    if camera not in cameras_for(settings.courts):
        msg = f"{camera.name} does not exist: the simulator has {settings.courts} court(s)"
        raise ValueError(msg)
    changed = set_running(settings.state_path, camera, running=running)
    verb = "started" if running else "stopped"
    out.write(f"{camera.name} {verb}\n" if changed else f"{camera.name} was already {verb}\n")
    return EXIT_OK


def _probe(settings: SimulatorSettings, out: TextIO) -> int:
    """A running camera must be readable and a stopped one must not be."""
    ffprobe = find_binary(settings.ffprobe_bin, env_var="CAMSIM_FFPROBE_BIN")
    stopped = read_stopped(settings.state_path)
    all_as_expected = True
    for camera in cameras_for(settings.courts):
        info = probe(ffprobe, stream_url(settings.rtsp_url, camera))
        expected_up = camera not in stopped
        as_expected = (info is not None) == expected_up
        all_as_expected = all_as_expected and as_expected
        seen = f"up {info.codec} {info.width}x{info.height}" if info else "down"
        verdict = (
            "ok" if as_expected else f"UNEXPECTED (should be {'up' if expected_up else 'down'})"
        )
        out.write(f"{camera.name}\t{seen}\t{verdict}\n")
    return EXIT_OK if all_as_expected else EXIT_ERROR


def _generate(args: argparse.Namespace, settings: SimulatorSettings, out: TextIO) -> int:
    ffmpeg = find_binary(settings.ffmpeg_bin)
    path = generate_testsrc(ffmpeg, Path(args.output), args.size, args.fps, args.seconds)
    out.write(f"Test video written to {path}\n")
    return EXIT_OK


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="edge-camsim", description="Camera simulator: recorded videos as RTSP streams."
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("run", help="publish every camera until stopped")
    sub.add_parser("list", help="list cameras, their state and RTSP URL")
    sub.add_parser("probe", help="check with ffprobe that each camera is up or down as expected")
    for name, help_text in (("start", "bring a camera back"), ("stop", "take a camera down")):
        cmd = sub.add_parser(name, help=help_text)
        cmd.add_argument("camera", help="camera name, e.g. court-1-a")
    gen = sub.add_parser("generate-test-video", help="write a synthetic H.264 test video")
    gen.add_argument("output", help="output .mp4 path")
    gen.add_argument("--size", default="1280x720", help="WIDTHxHEIGHT (default 1280x720)")
    gen.add_argument("--fps", type=int, default=25)
    gen.add_argument("--seconds", type=int, default=10)
    return parser


def _dispatch(args: argparse.Namespace, settings: SimulatorSettings, out: TextIO) -> int:
    match args.command:
        case "run":
            return _run(settings)
        case "list":
            return _list(settings, out)
        case "probe":
            return _probe(settings, out)
        case "start" | "stop":
            return _set(settings, args.camera, running=args.command == "start", out=out)
        case _:
            return _generate(args, settings, out)


def main(argv: Sequence[str] | None = None, out: TextIO | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        settings = load_simulator_settings()
    except SettingsError as error:
        sys.stderr.write(f"{error}\n")
        return EXIT_CONFIG_ERROR
    try:
        return _dispatch(args, settings, out or sys.stdout)
    except (
        ValueError,
        StateFileError,
        FfmpegNotFoundError,
        subprocess.CalledProcessError,
    ) as error:
        sys.stderr.write(f"{error}\n")
        return EXIT_ERROR


if __name__ == "__main__":
    sys.exit(main())
