import pytest

from edge_agent.camsim.cameras import Camera, cameras_for, stream_url


def test_two_cameras_per_court_in_order() -> None:
    names = [camera.name for camera in cameras_for(3)]

    assert names == ["court-1-a", "court-1-b", "court-2-a", "court-2-b", "court-3-a", "court-3-b"]


@pytest.mark.parametrize("courts", [0, -1])
def test_rejects_clubs_without_courts(courts: int) -> None:
    with pytest.raises(ValueError, match="at least 1 court"):
        cameras_for(courts)


@pytest.mark.parametrize(
    ("name", "expected"),
    [("court-1-a", Camera(1, "a")), (" COURT-12-B ", Camera(12, "b"))],
)
def test_parses_camera_names(name: str, expected: Camera) -> None:
    assert Camera.parse(name) == expected


@pytest.mark.parametrize("name", ["court-0-a", "court-1-c", "court-01-a", "cam1", "court-1-a/x"])
def test_rejects_invalid_camera_names(name: str) -> None:
    with pytest.raises(ValueError, match="Invalid camera name"):
        Camera.parse(name)


def test_rejects_invalid_camera_fields() -> None:
    with pytest.raises(ValueError, match="start at 1"):
        Camera(0, "a")
    with pytest.raises(ValueError, match="position"):
        Camera(1, "c")  # type: ignore[arg-type]


def test_stream_url_ignores_trailing_slash() -> None:
    camera = Camera(2, "b")

    assert stream_url("rtsp://mediamtx:8554/", camera) == "rtsp://mediamtx:8554/court-2-b"
    assert stream_url("rtsp://mediamtx:8554", camera) == "rtsp://mediamtx:8554/court-2-b"
