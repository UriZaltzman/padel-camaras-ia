"""Stage 1: court calibration (spec section 5.1, issue #120).

The installer marks the 12 known court points on the image. From them we compute

* a homography image <-> court floor with ``cv2.findHomography`` + RANSAC (after removing the
  lens distortion with the camera model measured once with a chessboard),
* the camera pose with ``cv2.solvePnP`` for the 3D rays used by triangulation,
* a mask of the court plus a margin, to ignore the audience.

If the mean error over the 12 points is above the threshold the calibration is rejected and the
installer redoes it. Every day the stored calibration is compared with the lines found again.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from numpy.typing import NDArray

from ml.geometry.consts import CM_PER_M, HALF, THREE, TWO
from ml.geometry.court import FloatArray, reference_points
from ml.thresholds import CalibrationThresholds, CourtGeometry


class CalibrationRejectedError(Exception):
    """The calibration error is above the limit: the installer must mark the points again."""

    def __init__(self, mean_error_cm: float, worst_point: int, limit_cm: float) -> None:
        super().__init__(
            f"mean error {mean_error_cm:.1f} cm is above {limit_cm:.1f} cm "
            f"(worst point: {worst_point})"
        )
        self.mean_error_cm = mean_error_cm
        self.worst_point = worst_point


@dataclass(frozen=True, eq=False)
class CameraIntrinsics:
    """Pinhole camera matrix and lens distortion (OpenCV model), measured once per model."""

    matrix: FloatArray
    distortion: FloatArray


@dataclass(frozen=True, eq=False)
class CourtCalibration:
    """Everything one camera needs to relate pixels and court metres."""

    intrinsics: CameraIntrinsics
    homography: FloatArray  # court floor (x, y) metres -> undistorted pixel
    rotation: FloatArray  # world -> camera
    translation: FloatArray
    mean_error_cm: float
    inliers: tuple[bool, ...]

    @property
    def camera_center(self) -> FloatArray:
        """Optical centre in court coordinates."""
        return np.asarray(-self.rotation.T @ self.translation.reshape(-1), dtype=np.float64)


@dataclass(frozen=True)
class DriftReport:
    """Result of the daily check of the stored calibration."""

    mean_shift_cm: float
    moved: bool


def undistort_pixels(intrinsics: CameraIntrinsics, pixels: FloatArray) -> FloatArray:
    """Remove lens distortion from raw pixels (N, 2); the result stays in pixel units."""
    pts = np.asarray(pixels, dtype=np.float64).reshape(-1, TWO)
    out = cv2.undistortPoints(
        pts[:, None, :], intrinsics.matrix, intrinsics.distortion, P=intrinsics.matrix
    )
    return np.asarray(out, dtype=np.float64).reshape(-1, TWO)


def pixel_to_court(cal: CourtCalibration, pixels: FloatArray) -> FloatArray:
    """Raw pixels -> court floor metres (N, 2), assuming the point is on the floor."""
    return undistorted_to_court(cal, undistort_pixels(cal.intrinsics, pixels))


def undistorted_to_court(cal: CourtCalibration, undistorted: FloatArray) -> FloatArray:
    """Undistorted pixels -> court floor metres (N, 2), assuming the point is on the floor."""
    und = np.asarray(undistorted, dtype=np.float64).reshape(-1, TWO)
    homog = np.column_stack([und, np.ones(len(und))])
    mapped = (np.linalg.inv(cal.homography) @ homog.T).T
    return np.asarray(mapped[:, :TWO] / mapped[:, TWO:THREE], dtype=np.float64)


def court_to_pixel(cal: CourtCalibration, points_m: FloatArray) -> FloatArray:
    """Court points (N, 3) metres -> raw (distorted) pixels (N, 2)."""
    pts = np.asarray(points_m, dtype=np.float64).reshape(-1, THREE)
    rvec, _ = cv2.Rodrigues(cal.rotation)
    out, _ = cv2.projectPoints(
        pts, rvec, cal.translation, cal.intrinsics.matrix, cal.intrinsics.distortion
    )
    return np.asarray(out, dtype=np.float64).reshape(-1, TWO)


def undistorted_rays(cal: CourtCalibration, undistorted: FloatArray) -> FloatArray:
    """Unit court-frame direction of the ray through each undistorted pixel, (N, 3)."""
    und = np.asarray(undistorted, dtype=np.float64).reshape(-1, TWO)
    homog = np.column_stack([und, np.ones(len(und))])
    cam_dirs = (np.linalg.inv(cal.intrinsics.matrix) @ homog.T).T
    world = (cal.rotation.T @ cam_dirs.T).T
    return np.asarray(world / np.linalg.norm(world, axis=1, keepdims=True), dtype=np.float64)


def pixel_rays(cal: CourtCalibration, pixels: FloatArray) -> FloatArray:
    """Unit direction in court coordinates of the ray through each raw pixel, (N, 3)."""
    pts = np.asarray(pixels, dtype=np.float64).reshape(-1, TWO)
    normalized = cv2.undistortPoints(
        pts[:, None, :], cal.intrinsics.matrix, cal.intrinsics.distortion
    )
    normalized = np.asarray(normalized, dtype=np.float64).reshape(-1, TWO)
    cam_dirs = np.column_stack([normalized, np.ones(len(normalized))])
    world = (cal.rotation.T @ cam_dirs.T).T
    return np.asarray(world / np.linalg.norm(world, axis=1, keepdims=True), dtype=np.float64)


def _court_error_cm(
    homography: FloatArray, undistorted: FloatArray, truth: FloatArray
) -> FloatArray:
    homog = np.column_stack([undistorted, np.ones(len(undistorted))])
    mapped = (np.linalg.inv(homography) @ homog.T).T
    court = mapped[:, :TWO] / mapped[:, TWO:THREE]
    return np.asarray(np.linalg.norm(court - truth, axis=1) * CM_PER_M, dtype=np.float64)


def calibrate(
    marked_pixels: FloatArray,
    intrinsics: CameraIntrinsics,
    court: CourtGeometry,
    thresholds: CalibrationThresholds,
) -> CourtCalibration:
    """Calibrate one camera from the 12 marked points, in the order of ``reference_points``.

    Raises ``CalibrationRejectedError`` if the mean error over the 12 points (in cm on the
    court floor) is above ``thresholds.max_mean_error_cm``, which includes the case where
    RANSAC had to throw away a point that was clicked in the wrong place.
    """
    truth = reference_points(court)
    if len(marked_pixels) != thresholds.reference_points or len(truth) != len(marked_pixels):
        msg = f"expected {thresholds.reference_points} marked points, got {len(marked_pixels)}"
        raise ValueError(msg)
    undistorted = undistort_pixels(intrinsics, marked_pixels)
    found, mask = cv2.findHomography(
        truth,
        undistorted,
        cv2.RANSAC,
        thresholds.ransac_reproj_threshold_px,
        maxIters=thresholds.ransac_max_iters,
        confidence=thresholds.ransac_confidence,
    )
    if found is None or mask is None:
        raise CalibrationRejectedError(float("inf"), 0, thresholds.max_mean_error_cm)
    homography = np.asarray(found, dtype=np.float64)
    errors = _court_error_cm(homography, undistorted, truth)
    mean_error = float(errors.mean())
    if mean_error > thresholds.max_mean_error_cm:
        raise CalibrationRejectedError(
            mean_error, int(np.argmax(errors)), thresholds.max_mean_error_cm
        )
    inliers = np.asarray(mask, dtype=bool).reshape(-1)
    obj3 = np.column_stack([truth, np.zeros(len(truth))])
    ok, rvec, tvec = cv2.solvePnP(
        obj3[inliers],
        undistorted[inliers],
        intrinsics.matrix,
        None,
        flags=cv2.SOLVEPNP_SQPNP,
    )
    if not ok:
        raise CalibrationRejectedError(float("inf"), 0, thresholds.max_mean_error_cm)
    rvec, tvec = cv2.solvePnPRefineLM(
        obj3[inliers], undistorted[inliers], intrinsics.matrix, None, rvec, tvec
    )
    rotation, _ = cv2.Rodrigues(rvec)
    centre_height = float((-rotation.T @ np.asarray(tvec, dtype=np.float64).reshape(-1))[TWO])
    if centre_height <= 0.0:  # a pose below the floor is the mirror solution of the plane
        raise CalibrationRejectedError(float("inf"), 0, thresholds.max_mean_error_cm)
    return CourtCalibration(
        intrinsics=intrinsics,
        homography=homography,
        rotation=np.asarray(rotation, dtype=np.float64),
        translation=np.asarray(tvec, dtype=np.float64).reshape(-1),
        mean_error_cm=mean_error,
        inliers=tuple(bool(v) for v in inliers),
    )


def check_drift(
    cal: CourtCalibration,
    observed_pixels: FloatArray,
    court: CourtGeometry,
    thresholds: CalibrationThresholds,
) -> DriftReport:
    """Daily check: where do the 12 reference points fall today, with the stored calibration?

    ``observed_pixels`` are the same 12 points found again in a fresh frame, in the same order.
    If they land further than ``drift_max_mean_shift_cm`` from where they belong, the camera
    moved and support must be told.
    """
    undistorted = undistort_pixels(cal.intrinsics, observed_pixels)
    errors = _court_error_cm(cal.homography, undistorted, reference_points(court))
    shift = float(errors.mean())
    return DriftReport(mean_shift_cm=shift, moved=shift > thresholds.drift_max_mean_shift_cm)


def in_court_area(court: CourtGeometry, margin_m: float, x_m: float, y_m: float) -> bool:
    """True if a floor point is inside the court or its margin (players, not the audience)."""
    return (
        -margin_m <= x_m <= court.width_m + margin_m
        and -margin_m <= y_m <= court.length_m + margin_m
    )


def court_mask(
    cal: CourtCalibration,
    court: CourtGeometry,
    margin_m: float,
    image_size: tuple[int, int],
) -> NDArray[np.uint8]:
    """Binary image mask (height, width) of the court plus the margin, in raw pixels."""
    width_px, height_px = image_size
    edge = np.linspace(0.0, 1.0, int(np.ceil(court.length_m / HALF)) + 1)
    x0, x1 = -margin_m, court.width_m + margin_m
    y0, y1 = -margin_m, court.length_m + margin_m
    ring: list[tuple[float, float]] = []
    ring.extend((x0 + (x1 - x0) * t, y0) for t in edge)
    ring.extend((x1, y0 + (y1 - y0) * t) for t in edge)
    ring.extend((x1 - (x1 - x0) * t, y1) for t in edge)
    ring.extend((x0, y1 - (y1 - y0) * t) for t in edge)
    floor = np.column_stack([np.array(ring), np.zeros(len(ring))])
    pixels = court_to_pixel(cal, floor)
    mask = np.zeros((height_px, width_px), dtype=np.uint8)
    cv2.fillPoly(mask, [np.round(pixels).astype(np.int32)], 1)
    return mask
