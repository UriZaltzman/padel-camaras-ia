"""Issue #124: Kalman smoothing of the per-camera ball track."""

from __future__ import annotations

import numpy as np
import pytest
from sim.camera import PROFILES, true_intrinsics
from sim.measure import measure_tracks, thresholds

from ml.ball.records import BallDetection, TrackPoint
from ml.ball.track import smooth_track
from ml.geometry.calibration import CameraIntrinsics
from ml.schemas import Camera

TH = thresholds()
FPS = 60.0
IDENTITY = CameraIntrinsics(matrix=np.eye(3) * 1.0, distortion=np.zeros(5))


def _flat_intrinsics() -> CameraIntrinsics:
    k = true_intrinsics()
    return CameraIntrinsics(matrix=k.matrix, distortion=np.zeros(5))


def _path(frame: int) -> tuple[float, float]:
    """A parabola in the image, like a ball in flight: 500 px/s sideways, falling."""
    t = frame / FPS
    return 300.0 + 500.0 * t, 200.0 + 100.0 * t + 400.0 * t * t


def _detection(frame: int, x: float, y: float, confidence: float = 0.9) -> BallDetection:
    return BallDetection(
        camera=Camera.A,
        frame=frame,
        time_ms=round(frame / FPS * 1000),
        confidence=confidence,
        x_px=x,
        y_px=y,
    )


def _on_path(frames: range) -> list[BallDetection]:
    return [_detection(f, *_path(f)) for f in frames]


def _smooth(dets: list[BallDetection]) -> tuple[dict[int, TrackPoint], list[BallDetection]]:
    result = smooth_track(dets, _flat_intrinsics(), TH.ball, TH.ball_track)
    return {p.frame: p for p in result.points}, list(result.rejected)


def test_a_clean_track_comes_back_unchanged() -> None:
    points, rejected = _smooth(_on_path(range(60)))
    assert not rejected
    assert sorted(points) == list(range(60))
    for f, p in points.items():
        assert (p.x_px, p.y_px) == pytest.approx(_path(f), abs=0.5)
        assert not p.interpolated


@pytest.mark.parametrize("gap", [1, 5, 10])
def test_gaps_up_to_ten_frames_are_filled_on_the_path(gap: int) -> None:
    dets = [d for d in _on_path(range(60)) if not 20 <= d.frame < 20 + gap]
    points, _ = _smooth(dets)
    for f in range(20, 20 + gap):
        assert points[f].interpolated
        assert (points[f].x_px, points[f].y_px) == pytest.approx(_path(f), abs=1.5)


def test_gaps_longer_than_ten_frames_are_not_invented() -> None:
    dets = [d for d in _on_path(range(80)) if not 20 <= d.frame < 32]  # 12 frames missing
    points, _ = _smooth(dets)
    assert all(f not in points for f in range(20, 32))
    assert 19 in points
    assert 32 in points


def test_an_impossible_jump_is_dropped_and_the_frame_is_filled_instead() -> None:
    dets = _on_path(range(60))
    dets[30] = _detection(30, 1500.0, 900.0)
    points, rejected = _smooth(dets)
    assert [d.frame for d in rejected] == [30]
    assert points[30].interpolated
    assert (points[30].x_px, points[30].y_px) == pytest.approx(_path(30), abs=1.5)


def test_a_false_candidate_next_to_the_real_one_loses_to_it() -> None:
    dets = _on_path(range(60))
    dets.append(_detection(30, 40.0, 1000.0, confidence=0.99))  # more confident, but far
    points, rejected = _smooth(dets)
    assert any(d.frame == 30 and d.x_px == 40.0 for d in rejected)
    assert (points[30].x_px, points[30].y_px) == pytest.approx(_path(30), abs=1.0)


def test_the_track_restarts_after_the_ball_really_moved_elsewhere() -> None:
    first = _on_path(range(30))
    second = [
        _detection(f, 1700.0 - 200.0 * (f - 30) / FPS, 150.0 + 80.0 * (f - 30) / FPS)
        for f in range(30, 70)
    ]
    points, _ = _smooth(first + second)
    assert all(f in points for f in (29, 40, 69))
    assert points[60].x_px > 1000.0


def test_an_isolated_detection_is_not_a_track() -> None:
    points, _ = _smooth([_detection(10, 500.0, 500.0)])
    assert points == {}


def test_weak_detections_are_ignored() -> None:
    dets = _on_path(range(40))
    dets[10] = _detection(10, 1500.0, 900.0, confidence=TH.ball_track.min_confidence / 2)
    points, rejected = _smooth(dets)
    assert not rejected
    assert points[10].interpolated


def test_no_detections_give_an_empty_track() -> None:
    result = smooth_track([], _flat_intrinsics(), TH.ball, TH.ball_track)
    assert result.points == ()
    assert result.rejected == ()


def test_filled_frames_get_times_between_their_neighbours() -> None:
    dets = [d for d in _on_path(range(40)) if d.frame != 15]
    points, _ = _smooth(dets)
    assert points[14].time_ms < points[15].time_ms < points[16].time_ms
    assert points[15].confidence == pytest.approx(0.9)


def test_the_smoothed_velocity_matches_the_motion() -> None:
    points, _ = _smooth(_on_path(range(60)))
    p = points[30]
    assert p.vx_px_s == pytest.approx(500.0, rel=0.05)
    assert p.vy_px_s == pytest.approx(100.0 + 800.0 * 30 / FPS, rel=0.05)


def test_the_constants_come_from_the_thresholds_file() -> None:
    assert TH.ball.kalman_max_gap_frames == 10


@pytest.mark.parametrize(("level", "recall"), [("low", 0.93), ("medium", 0.93), ("high", 0.87)])
def test_gap_filling_recall_on_simulated_matches(level: str, recall: float) -> None:
    s = measure_tracks(PROFILES[level], range(10))
    assert s.gap_frames > 500
    assert s.gap_filled_ok / s.gap_frames >= recall
    assert s.long_gap_filled / s.long_gap_frames <= 0.03, "long blind spots must stay empty"


@pytest.mark.parametrize(("level", "rejected"), [("low", 0.88), ("medium", 0.88), ("high", 0.85)])
def test_false_detections_are_rejected_and_good_ones_kept(level: str, rejected: float) -> None:
    s = measure_tracks(PROFILES[level], range(10))
    assert s.false_total > 20
    assert s.false_rejected / s.false_total >= rejected
    assert s.true_rejected / s.true_total <= 0.02


@pytest.mark.parametrize("level", ["low", "medium", "high"])
def test_smoothing_is_closer_to_the_truth_than_the_raw_detections(level: str) -> None:
    s = measure_tracks(PROFILES[level], range(10))
    assert np.mean(s.smooth_err_px) < np.mean(s.raw_err_px)
