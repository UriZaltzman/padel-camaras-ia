import json
from pathlib import Path

import pytest

from edge_agent.recorder.ffmpeg import (
    StreamProfile,
    parse_probe_output,
    probe_command,
    profile_problems,
    record_command,
)

URL = "rtsp://10.0.0.11:554/stream1"


def option(command: list[str], name: str) -> str:
    return command[command.index(name) + 1]


def test_record_command_copies_into_10s_segments(tmp_path: Path) -> None:
    command = record_command("ffmpeg", URL, "court-1-a", tmp_path, tmp_path / "l.csv")

    assert command[0] == "ffmpeg"
    assert option(command, "-i") == URL
    assert option(command, "-c") == "copy"
    assert "-c:v" not in command  # never re-encodes
    assert option(command, "-map") == "0:v:0"
    assert option(command, "-f") == "segment"
    assert option(command, "-segment_time") == "10"
    assert option(command, "-segment_atclocktime") == "1"
    assert option(command, "-segment_format") == "mpegts"
    assert option(command, "-strftime") == "1"
    assert option(command, "-rtsp_transport") == "tcp"
    assert option(command, "-segment_list") == str(tmp_path / "l.csv")
    assert option(command, "-segment_list_type") == "csv"
    assert command[-1] == str(tmp_path / "court-1-a-%Y%m%dT%H%M%SZ.ts")


def test_input_options_come_before_input(tmp_path: Path) -> None:
    command = record_command("ffmpeg", URL, "court-1-a", tmp_path, tmp_path / "l.csv")

    assert command.index("-timeout") < command.index("-i")
    assert command.index("-rtsp_transport") < command.index("-i")


def test_record_command_rejects_unsafe_camera_name(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="Invalid camera name"):
        record_command("ffmpeg", URL, "../etc", tmp_path, tmp_path / "l.csv")


def test_probe_command_asks_for_frame_rate() -> None:
    command = probe_command("ffprobe", URL)

    assert command[-1] == URL
    assert "r_frame_rate" in option(command, "-show_entries")


def test_parse_probe_output() -> None:
    raw = json.dumps(
        {"streams": [{"codec_name": "hevc", "width": 2560, "height": 1440, "r_frame_rate": "25/1"}]}
    )

    assert parse_probe_output(raw) == StreamProfile("hevc", 2560, 1440, 25.0)


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "{}",
        '{"streams": []}',
        '{"streams": [{"codec_name": "h264", "width": 1, "height": 1, "r_frame_rate": "0/0"}]}',
        '{"streams": [{"codec_name": "h264"}]}',
        "[1]",
    ],
)
def test_parse_probe_output_without_video(raw: str) -> None:
    assert parse_probe_output(raw) is None


def test_profile_matches_spec() -> None:
    assert profile_problems(StreamProfile("h264", 2560, 1440, 25.0)) == []
    assert profile_problems(StreamProfile("h264", 2560, 1440, 24.99)) == []


def test_profile_problems_name_each_difference() -> None:
    problems = profile_problems(StreamProfile("h264", 1920, 1080, 30.0))

    assert problems == ["size 1920x1080, expected 2560x1440", "30 fps, expected 25"]
