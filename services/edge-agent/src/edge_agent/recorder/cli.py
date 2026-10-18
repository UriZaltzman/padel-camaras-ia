"""``edge-recorder``: record cameras from the command line or from a local schedule.

edge-recorder record --camera court-1-a --camera court-1-b --minutes 90
    # starts now, stops 90 + 2 minutes later (end margin) or on Ctrl+C / SIGTERM
edge-recorder run --schedule schedule.json
    # records each shift of the file with 2 minutes of margin; re-reads it when it changes
edge-recorder check --schedule schedule.json
    # continuity of every finished shift (margins included); exit 1 if a segment is missing
edge-recorder check --camera court-1-a --from 2026-10-17T20:00:00-03:00 --to ...
edge-recorder probe
    # ffprobe each camera; exit 1 if one is down or not 2560x1440 at 25 fps

Needs the agent settings (``EDGE_*``) plus ``EDGE_RECORDER_CAMERAS`` for record, run and
probe. Camera URLs are never printed or logged.
"""

import argparse
import logging
import signal
import sqlite3
import sys
import threading
from collections.abc import Callable, Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import FrameType
from typing import Final, TextIO

from edge_agent.logs import configure_logging, log_context
from edge_agent.recorder.catalog import spans_between
from edge_agent.recorder.continuity import DEFAULT_TOLERANCE_S, find_gaps
from edge_agent.recorder.ffmpeg import probe, profile_problems
from edge_agent.recorder.runner import Recorder
from edge_agent.recorder.schedule import (
    MARGIN,
    ScheduleError,
    Shift,
    cameras_due,
    load_schedule,
    recording_windows,
)
from edge_agent.recorder.settings import RecorderSettings, load_recorder_settings
from edge_agent.settings import EdgeSettings, SettingsError, load_settings
from edge_agent.store import open_store

EXIT_OK: Final = 0
EXIT_ERROR: Final = 1
EXIT_CONFIG_ERROR: Final = 2

logger = logging.getLogger("edge_agent.recorder")


class ScheduleSource:
    """Cameras due according to a schedule file, re-read whenever the file changes.

    If the file becomes invalid, the last valid version keeps recording.
    """

    def __init__(self, path: Path, known_cameras: frozenset[str]) -> None:
        self._path = path
        self._known = known_cameras
        self._mtime_ns: int | None = None
        self._shifts: tuple[Shift, ...] = ()
        self.reload()

    def reload(self) -> None:
        shifts = load_schedule(self._path)
        unknown = {c for shift in shifts for c in shift.cameras} - self._known
        if unknown:
            msg = f"Schedule names cameras that are not configured: {sorted(unknown)}"
            raise ScheduleError(msg)
        self._shifts = shifts
        self._mtime_ns = self._path.stat().st_mtime_ns

    def __call__(self, now: datetime) -> frozenset[str]:
        try:
            if self._path.stat().st_mtime_ns != self._mtime_ns:
                self.reload()
                logger.info("recorder_schedule_reloaded", extra={"shifts": len(self._shifts)})
        except (OSError, ScheduleError) as error:
            logger.error("recorder_schedule_invalid", extra={"error": str(error)})
        return cameras_due(recording_windows(self._shifts), now)


def _install_signal_handlers(stop: threading.Event) -> None:
    def _request_stop(signum: int, _frame: FrameType | None) -> None:
        logger.info("recorder_stopping", extra={"signal": signum})
        stop.set()

    signal.signal(signal.SIGTERM, _request_stop)
    signal.signal(signal.SIGINT, _request_stop)


def _record_with(
    edge: EdgeSettings,
    recorder_settings: RecorderSettings,
    desired: Callable[[datetime], frozenset[str]],
    until: Callable[[], bool] = lambda: False,
) -> int:
    conn = open_store(edge.db_path)
    try:
        recorder = Recorder(
            recorder_settings.cameras,
            recorder_settings.segments_root(edge.data_dir),
            conn,
            recorder_settings.ffmpeg_bin,
            desired=desired,
        )
        stop = threading.Event()
        _install_signal_handlers(stop)
        logger.info("recorder_started", extra={"cameras": sorted(recorder_settings.cameras)})
        recorder.run(stop, until=until)
        logger.info("recorder_stopped")
    finally:
        conn.close()
    return EXIT_OK


def _cmd_record(args: argparse.Namespace, edge: EdgeSettings) -> int:
    settings = load_recorder_settings()
    cameras = frozenset(args.camera)
    unknown = cameras - set(settings.cameras)
    if unknown:
        msg = f"Cameras not configured in EDGE_RECORDER_CAMERAS: {sorted(unknown)}"
        raise ValueError(msg)
    now = datetime.now(UTC)
    end = args.until if args.until is not None else now + timedelta(minutes=args.minutes)
    if end <= now:
        msg = "--until must be in the future"
        raise ValueError(msg)
    stop_at = end + MARGIN
    logger.info(
        "recorder_manual_recording",
        extra={"cameras": sorted(cameras), "stop_at": stop_at.isoformat()},
    )
    return _record_with(
        edge,
        settings,
        desired=lambda when: cameras if when < stop_at else frozenset(),
        until=lambda: datetime.now(UTC) >= stop_at,
    )


def _cmd_run(args: argparse.Namespace, edge: EdgeSettings) -> int:
    settings = load_recorder_settings()
    source = ScheduleSource(Path(args.schedule), frozenset(settings.cameras))
    return _record_with(edge, settings, desired=source)


def _check_window(
    conn: sqlite3.Connection,
    label: str,
    camera: str,
    *,
    start: datetime,
    end: datetime,
    tolerance_s: float,
    out: TextIO,
) -> bool:
    spans = spans_between(conn, camera, start, end)
    gaps = find_gaps(spans, start, end, tolerance_s)
    if not gaps:
        out.write(f"{label}\t{camera}\tok\t{len(spans)} segments\n")
        return True
    missing = ", ".join(
        f"{g.start.isoformat()}..{g.end.isoformat()} ({g.seconds:.1f}s)" for g in gaps
    )
    out.write(f"{label}\t{camera}\tGAPS\t{missing}\n")
    return False


def _cmd_check(args: argparse.Namespace, edge: EdgeSettings, out: TextIO) -> int:
    conn = open_store(edge.db_path)
    try:
        ok = True
        if args.schedule is not None:
            now = datetime.now(UTC)
            for shift in load_schedule(Path(args.schedule)):
                start, end = shift.window()
                if end > now:
                    out.write(f"{shift.id}\t-\tnot finished yet\n")
                    continue
                for camera in shift.cameras:
                    ok &= _check_window(
                        conn,
                        shift.id,
                        camera,
                        start=start,
                        end=end,
                        tolerance_s=args.tolerance,
                        out=out,
                    )
        else:
            if args.camera is None or args.start is None or args.end is None:
                msg = "check needs --schedule, or --camera with --from and --to"
                raise ValueError(msg)
            for camera in args.camera:
                ok &= _check_window(
                    conn,
                    "window",
                    camera,
                    start=args.start,
                    end=args.end,
                    tolerance_s=args.tolerance,
                    out=out,
                )
    finally:
        conn.close()
    return EXIT_OK if ok else EXIT_ERROR


def _cmd_probe(out: TextIO) -> int:
    settings = load_recorder_settings()
    ok = True
    for camera, url in sorted(settings.cameras.items()):
        profile = probe(settings.ffprobe_bin, url.get_secret_value())
        if profile is None:
            out.write(f"{camera}\tdown\n")
            ok = False
            continue
        problems = profile_problems(profile)
        ok = ok and not problems
        seen = f"{profile.codec} {profile.width}x{profile.height} {profile.fps:g}fps"
        out.write(f"{camera}\t{seen}\t{'; '.join(problems) or 'ok'}\n")
    return EXIT_OK if ok else EXIT_ERROR


def _aware_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        msg = f"{value!r} has no UTC offset (e.g. 2026-10-17T20:00:00-03:00)"
        raise argparse.ArgumentTypeError(msg)
    return parsed.astimezone(UTC)


def _positive_minutes(value: str) -> int:
    minutes = int(value)
    if minutes < 1:
        msg = "must be at least 1"
        raise argparse.ArgumentTypeError(msg)
    return minutes


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="edge-recorder", description="Record cameras into 10 s segments."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    record = sub.add_parser("record", help="record now, for a while (+2 min margin)")
    record.add_argument("--camera", action="append", required=True, help="repeat per camera")
    length = record.add_mutually_exclusive_group(required=True)
    length.add_argument("--minutes", type=_positive_minutes, help="length of the shift")
    length.add_argument("--until", type=_aware_datetime, help="end of the shift (ISO 8601)")

    run = sub.add_parser("run", help="record what the schedule file says")
    run.add_argument("--schedule", required=True, help="JSON schedule file")

    check = sub.add_parser("check", help="continuity check over the saved segments")
    check.add_argument("--schedule", help="check every finished shift of this file")
    check.add_argument("--camera", action="append", help="camera to check (repeatable)")
    check.add_argument("--from", dest="start", type=_aware_datetime, help="window start")
    check.add_argument("--to", dest="end", type=_aware_datetime, help="window end")
    check.add_argument(
        "--tolerance",
        type=float,
        default=DEFAULT_TOLERANCE_S,
        help=f"seconds without video tolerated (default {DEFAULT_TOLERANCE_S})",
    )

    sub.add_parser("probe", help="check each camera is up and 2560x1440 at 25 fps")
    return parser


def _dispatch(args: argparse.Namespace, edge: EdgeSettings, out: TextIO) -> int:
    match args.command:
        case "record":
            return _cmd_record(args, edge)
        case "run":
            return _cmd_run(args, edge)
        case "check":
            return _cmd_check(args, edge, out)
        case _:
            return _cmd_probe(out)


def main(argv: Sequence[str] | None = None, out: TextIO | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        edge = load_settings()
    except SettingsError as error:
        sys.stderr.write(f"{error}\n")
        return EXIT_CONFIG_ERROR
    configure_logging(edge.log_level)
    with log_context(club_id=str(edge.club_id)):
        try:
            return _dispatch(args, edge, out or sys.stdout)
        except SettingsError as error:
            sys.stderr.write(f"{error}\n")
            return EXIT_CONFIG_ERROR
        except (ValueError, ScheduleError, OSError) as error:
            sys.stderr.write(f"{error}\n")
            return EXIT_ERROR


if __name__ == "__main__":
    sys.exit(main())
