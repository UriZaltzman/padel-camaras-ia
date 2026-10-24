"""Issue #120: court calibration from the 12 known points."""

from __future__ import annotations

import random

import numpy as np
import pytest
from sim.camera import (
    HEIGHT_PX,
    PROFILES,
    WIDTH_PX,
    estimated_intrinsics,
    make_camera,
    marked_points,
    true_intrinsics,
)
from sim.measure import measure_calibration, thresholds
from sim.pipeline import perfect_calibration

from ml.geometry.calibration import (
    CalibrationRejectedError,
    calibrate,
    check_drift,
    court_mask,
    court_to_pixel,
    in_court_area,
    pixel_rays,
    pixel_to_court,
    undistort_pixels,
)
from ml.geometry.court import net_height_at, reference_points

COURT = thresholds().court
CAL = thresholds().calibration


def _exact_marks(name: str) -> np.ndarray:
    cam = make_camera(name, COURT)
    ref = reference_points(COURT)
    return cam.project(np.column_stack([ref, np.zeros(len(ref))]))


def test_the_12_reference_points_are_the_known_court_marks() -> None:
    points = reference_points(COURT)
    assert points.shape == (CAL.reference_points, 2)
    as_set = {(round(x, 2), round(y, 2)) for x, y in points}
    assert len(as_set) == 12
    for corner in [(0, 0), (10, 0), (0, 20), (10, 20)]:
        assert corner in as_set
    assert (0.0, 3.05) in as_set
    assert (5.0, 16.95) in as_set
    assert (0.0, 10.0) in as_set
    assert (10.0, 10.0) in as_set


def test_net_is_lowest_in_the_centre_and_highest_at_the_posts() -> None:
    assert net_height_at(COURT, 5.0) == pytest.approx(0.88)
    assert net_height_at(COURT, 0.0) == pytest.approx(0.92)
    assert net_height_at(COURT, 10.0) == pytest.approx(0.92)
    assert 0.88 < net_height_at(COURT, 2.5) < 0.92


@pytest.mark.parametrize("name", ["A", "B"])
def test_exact_clicks_give_an_exact_homography(name: str) -> None:
    cal = calibrate(_exact_marks(name), true_intrinsics(), COURT, CAL)
    assert cal.mean_error_cm < 0.01
    grid = np.array([(x, y) for x in range(11) for y in range(21)], dtype=float)
    cam = make_camera(name, COURT)
    pixels = cam.project(np.column_stack([grid, np.zeros(len(grid))]))
    assert np.abs(pixel_to_court(cal, pixels) - grid).max() < 0.01


@pytest.mark.parametrize("name", ["A", "B"])
def test_pnp_recovers_the_camera_pose(name: str) -> None:
    cal = calibrate(_exact_marks(name), true_intrinsics(), COURT, CAL)
    cam = make_camera(name, COURT)
    assert np.linalg.norm(cal.camera_center - cam.position) < 0.02
    # A pixel's ray from the calibrated pose passes through the 3D point that made it.
    point = np.array([[3.0, 8.0, 2.5]])
    ray = pixel_rays(cal, cam.project(point))[0]
    to_point = point[0] - cal.camera_center
    off_axis = np.linalg.norm(to_point - np.dot(to_point, ray) * ray)
    assert off_axis < 0.02
    assert np.allclose(court_to_pixel(cal, point), cam.project(point), atol=0.05)


def test_distortion_is_removed_before_the_homography() -> None:
    cam = make_camera("A", COURT)
    corner = cam.project(np.array([[0.0, 0.0, 0.0]]))
    flat = undistort_pixels(true_intrinsics(), corner)
    assert np.linalg.norm(flat - corner) > 3.0  # the lens bends the corner noticeably


def test_a_wrongly_clicked_point_is_rejected_and_named() -> None:
    marks = _exact_marks("A")
    marks[7] += np.array([40.0, -25.0])
    with pytest.raises(CalibrationRejectedError) as raised:
        calibrate(marks, true_intrinsics(), COURT, CAL)
    assert raised.value.mean_error_cm > CAL.max_mean_error_cm
    assert raised.value.worst_point == 7


def test_the_wrong_number_of_points_is_an_error() -> None:
    with pytest.raises(ValueError, match="expected 12"):
        calibrate(_exact_marks("A")[:8], true_intrinsics(), COURT, CAL)


def test_a_calibration_over_the_limit_is_rejected() -> None:
    rng = random.Random(3)
    cam = make_camera("A", COURT)
    noisy = PROFILES["low"].__class__(**{**PROFILES["low"].__dict__, "mark_px": 6.0})
    with pytest.raises(CalibrationRejectedError):
        calibrate(
            marked_points(cam, COURT, rng, noisy), estimated_intrinsics(rng, noisy), COURT, CAL
        )


@pytest.mark.parametrize("level", ["low", "medium"])
def test_calibration_error_stays_under_the_limit_at_realistic_click_noise(level: str) -> None:
    stats = measure_calibration(PROFILES[level], trials=20)
    assert stats.rejected <= 0.05 * stats.total
    assert np.mean(stats.in_sample_cm) < CAL.max_mean_error_cm
    assert np.mean(stats.grid_mean_cm) < 3.0, "mean error over the whole floor, in cm"
    assert np.max(stats.grid_max_cm) < 15.0


def test_at_one_pixel_of_click_noise_the_installer_sometimes_has_to_redo_it() -> None:
    stats = measure_calibration(PROFILES["high"], trials=20)
    assert 0 < stats.rejected < 0.6 * stats.total
    assert np.mean(stats.grid_mean_cm) < 4.0


def test_the_court_area_accepts_players_and_ignores_the_audience() -> None:
    margin = CAL.court_mask_margin_m
    assert margin == 1.5
    assert in_court_area(COURT, margin, 5.0, 10.0)
    assert in_court_area(COURT, margin, -1.4, 21.4)
    assert not in_court_area(COURT, margin, -1.6, 10.0)
    assert not in_court_area(COURT, margin, 5.0, 21.6)
    assert not in_court_area(COURT, margin, 12.0, 5.0)


def test_the_image_mask_covers_the_court_and_its_margin_only() -> None:
    cal = perfect_calibration(make_camera("A", COURT), thresholds())
    mask = court_mask(cal, COURT, CAL.court_mask_margin_m, (WIDTH_PX, HEIGHT_PX))
    assert mask.shape == (HEIGHT_PX, WIDTH_PX)

    def inside(x: float, y: float) -> bool:
        u, v = court_to_pixel(cal, np.array([[x, y, 0.0]]))[0]
        return bool(mask[round(v), round(u)])

    assert inside(5.0, 10.0)
    assert inside(0.2, 0.3)
    assert inside(-1.2, 21.2)
    assert not inside(-2.5, 10.0)
    assert not inside(12.5, 10.0)
    covered = mask.mean()
    assert 0.15 < covered < 0.9


def test_the_daily_check_passes_when_nothing_moved() -> None:
    cal = perfect_calibration(make_camera("A", COURT), thresholds())
    rng = random.Random(1)
    today = marked_points(make_camera("A", COURT), COURT, rng, PROFILES["low"])
    report = check_drift(cal, today, COURT, CAL)
    assert not report.moved
    assert report.mean_shift_cm < CAL.drift_max_mean_shift_cm


@pytest.mark.parametrize("shift_px", [8.0, 20.0])
def test_the_daily_check_flags_a_camera_that_moved(shift_px: float) -> None:
    cal = perfect_calibration(make_camera("A", COURT), thresholds())
    today = _exact_marks("A") + np.array([shift_px, shift_px / 2])
    report = check_drift(cal, today, COURT, CAL)
    assert report.moved
    assert report.mean_shift_cm > CAL.drift_max_mean_shift_cm


def test_the_daily_check_hour_is_the_one_in_the_spec() -> None:
    assert CAL.daily_check_local_hour == 7
