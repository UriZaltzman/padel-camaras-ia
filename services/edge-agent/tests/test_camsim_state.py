from pathlib import Path

import pytest

from edge_agent.camsim.cameras import Camera
from edge_agent.camsim.state import StateFileError, read_stopped, set_running


def test_missing_file_means_every_camera_runs(tmp_path: Path) -> None:
    assert read_stopped(tmp_path / "cameras.json") == frozenset()


def test_stop_and_start_round_trip(tmp_path: Path) -> None:
    path = tmp_path / "nested" / "cameras.json"
    a, b = Camera(1, "a"), Camera(2, "b")

    assert set_running(path, b, running=False) is True
    assert set_running(path, a, running=False) is True
    assert read_stopped(path) == {a, b}
    assert '"court-1-a"' in path.read_text()

    assert set_running(path, a, running=True) is True
    assert read_stopped(path) == {b}


def test_repeated_change_reports_nothing_changed(tmp_path: Path) -> None:
    path = tmp_path / "cameras.json"
    camera = Camera(1, "a")

    assert set_running(path, camera, running=True) is False
    assert not path.exists()
    set_running(path, camera, running=False)
    assert set_running(path, camera, running=False) is False


def test_no_temporary_files_are_left_behind(tmp_path: Path) -> None:
    path = tmp_path / "cameras.json"
    set_running(path, Camera(1, "a"), running=False)

    assert sorted(p.name for p in tmp_path.iterdir()) == ["cameras.json", "cameras.json.lock"]


@pytest.mark.parametrize(
    "content", ["not json", "{}", '{"stopped": "court-1-a"}', '{"stopped": ["cam-9"]}', "[]"]
)
def test_unreadable_file_raises_clear_error(tmp_path: Path, content: str) -> None:
    path = tmp_path / "cameras.json"
    path.write_text(content)

    with pytest.raises(StateFileError, match="Unreadable camera state file"):
        read_stopped(path)
