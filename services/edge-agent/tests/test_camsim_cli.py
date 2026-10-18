import io
import logging
from pathlib import Path

import pytest

from edge_agent.camsim import cli
from edge_agent.camsim.cameras import Camera
from edge_agent.camsim.cli import EXIT_CONFIG_ERROR, EXIT_ERROR, EXIT_OK, main, plan_videos
from edge_agent.camsim.ffmpeg import StreamInfo
from edge_agent.camsim.settings import SimulatorSettings, load_simulator_settings
from edge_agent.camsim.state import read_stopped
from edge_agent.settings import SettingsError


@pytest.fixture
def camsim_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    monkeypatch.setenv("CAMSIM_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("CAMSIM_VIDEO_DIR", str(tmp_path / "videos"))
    monkeypatch.setenv("CAMSIM_RTSP_URL", "rtsp://mediamtx:8554")
    monkeypatch.setenv("CAMSIM_ADVERTISED_RTSP_URL", "rtsp://localhost:8554")
    return tmp_path


def run(*argv: str) -> tuple[int, str]:
    out = io.StringIO()
    return main(list(argv), out=out), out.getvalue()


def test_defaults() -> None:
    settings = SimulatorSettings()

    assert settings.courts == 2
    assert settings.reader_rtsp_url == "rtsp://localhost:8554"
    assert settings.state_path.name == "cameras.json"


@pytest.mark.parametrize(
    ("var", "value"),
    [
        ("CAMSIM_COURTS", "0"),
        ("CAMSIM_COURTS", "17"),
        ("CAMSIM_RTSP_URL", "http://mediamtx:8554"),
        ("CAMSIM_RTSP_URL", "rtsp://mediamtx:8554/path"),
        ("CAMSIM_TEST_VIDEO_SIZE", "big"),
    ],
)
def test_invalid_settings_name_the_variable_without_its_value(
    monkeypatch: pytest.MonkeyPatch, var: str, value: str
) -> None:
    monkeypatch.setenv(var, value)

    with pytest.raises(SettingsError) as excinfo:
        load_simulator_settings()

    message = str(excinfo.value)
    assert var in message
    assert "camera simulator" in message
    assert value not in message


def test_invalid_settings_exit_with_config_error(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("CAMSIM_COURTS", "zero")

    assert run("list")[0] == EXIT_CONFIG_ERROR
    assert "CAMSIM_COURTS" in capsys.readouterr().err


def test_list_shows_every_camera_with_reader_url(
    camsim_env: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CAMSIM_COURTS", "3")

    code, out = run("list")

    lines = out.splitlines()
    assert code == EXIT_OK
    assert len(lines) == 6
    assert lines[0] == "court-1-a\trunning\trtsp://localhost:8554/court-1-a"
    assert lines[-1].startswith("court-3-b\trunning")


def test_stop_and_start_a_camera(camsim_env: Path) -> None:
    state = camsim_env / "state" / "cameras.json"

    assert run("stop", "court-1-b") == (EXIT_OK, "court-1-b stopped\n")
    assert read_stopped(state) == {Camera(1, "b")}
    assert run("stop", "court-1-b") == (EXIT_OK, "court-1-b was already stopped\n")
    assert "court-1-b\tstopped" in run("list")[1]

    assert run("start", "court-1-b") == (EXIT_OK, "court-1-b started\n")
    assert read_stopped(state) == frozenset()


def test_rejects_cameras_outside_the_club(
    camsim_env: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert run("stop", "court-3-a")[0] == EXIT_ERROR
    assert "simulator has 2 court(s)" in capsys.readouterr().err
    assert run("stop", "camera-1")[0] == EXIT_ERROR
    assert "Invalid camera name" in capsys.readouterr().err


def test_corrupt_state_file_is_reported(
    camsim_env: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    state = camsim_env / "state" / "cameras.json"
    state.parent.mkdir(parents=True)
    state.write_text("garbage")

    assert run("list")[0] == EXIT_ERROR
    assert "Unreadable camera state file" in capsys.readouterr().err


def test_missing_ffmpeg_is_reported(
    camsim_env: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("CAMSIM_FFMPEG_BIN", "definitely-not-ffmpeg-xyz")

    assert run("run")[0] == EXIT_ERROR
    assert "CAMSIM_FFMPEG_BIN" in capsys.readouterr().err


def test_plan_videos_falls_back_to_test_video(tmp_path: Path) -> None:
    (tmp_path / "court-1-a.mp4").write_bytes(b"")
    fallback = tmp_path / "state" / "testsrc.mp4"

    plan = plan_videos([Camera(1, "a"), Camera(1, "b")], tmp_path, fallback)

    assert plan == {Camera(1, "a"): tmp_path / "court-1-a.mp4", Camera(1, "b"): fallback}


def test_build_commands_publish_to_internal_url(camsim_env: Path) -> None:
    settings = load_simulator_settings()
    videos = {Camera(1, "a"): Path("/videos/default.mp4")}

    commands = cli.build_commands(settings, "ffmpeg", videos)

    assert commands[Camera(1, "a")][-1] == "rtsp://mediamtx:8554/court-1-a"


def test_probe_checks_each_camera_against_desired_state(
    camsim_env: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CAMSIM_COURTS", "1")
    monkeypatch.setattr(cli, "find_binary", lambda name, env_var="": name)
    up = {"rtsp://mediamtx:8554/court-1-a"}
    probed: list[str] = []

    def fake_probe(_ffprobe: str, url: str) -> StreamInfo | None:
        probed.append(url)
        return StreamInfo("h264", 2560, 1440) if url in up else None

    monkeypatch.setattr(cli, "probe", fake_probe)

    code, out = run("probe")
    assert code == EXIT_ERROR
    assert "court-1-a\tup h264 2560x1440\tok" in out
    assert "court-1-b\tdown\tUNEXPECTED (should be up)" in out
    assert probed == ["rtsp://mediamtx:8554/court-1-a", "rtsp://mediamtx:8554/court-1-b"]

    run("stop", "court-1-b")
    code, out = run("probe")
    assert code == EXIT_OK
    assert "court-1-b\tdown\tok" in out


SECRET_URL = "rtsp://admin:s3cr3t@mediamtx:8554"  # noqa: S105 - fake test credential


def test_list_never_prints_credentials(camsim_env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CAMSIM_ADVERTISED_RTSP_URL", SECRET_URL)

    code, out = run("list")

    assert code == EXIT_OK
    assert "s3cr3t" not in out
    assert "admin" not in out
    assert "court-1-a\trunning\trtsp://***@mediamtx:8554/court-1-a" in out


def test_run_never_logs_credentials(
    camsim_env: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("CAMSIM_COURTS", "1")
    monkeypatch.setenv("CAMSIM_RTSP_URL", SECRET_URL)
    monkeypatch.setenv("CAMSIM_ADVERTISED_RTSP_URL", "rtsp://viewer:hunter2@localhost:8554")
    videos = camsim_env / "videos"
    videos.mkdir()
    (videos / "default.mp4").write_bytes(b"")
    monkeypatch.setattr(cli, "find_binary", lambda name, env_var="": name)

    class FakeSupervisor:
        def __init__(self, commands: object, state_path: object) -> None:
            pass

        def run(self, stop: object) -> None:
            logging.getLogger("edge_agent.camsim").info("fake_supervisor_done")

    monkeypatch.setattr(cli, "Supervisor", FakeSupervisor)

    code, _ = run("run")

    captured = capsys.readouterr()
    logs = captured.out + captured.err
    assert code == EXIT_OK
    assert "camsim_camera_configured" in logs
    assert "s3cr3t" not in logs
    assert "hunter2" not in logs


def test_errors_never_print_credentials(
    camsim_env: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def failing_list(_settings: SimulatorSettings, _out: object) -> int:
        msg = f"cannot read {SECRET_URL}/court-1-a"
        raise ValueError(msg)

    monkeypatch.setattr(cli, "_list", failing_list)

    assert run("list")[0] == EXIT_ERROR
    err = capsys.readouterr().err
    assert "s3cr3t" not in err
    assert "rtsp://***@mediamtx:8554/court-1-a" in err
