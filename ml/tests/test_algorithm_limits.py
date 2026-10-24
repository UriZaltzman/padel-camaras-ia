"""The limits listed in docs/ml/algorithm-limits.md, pinned so the document cannot go stale."""

from __future__ import annotations

import dataclasses
import random

import numpy as np
from sim.camera import PROFILES, make_camera, marked_points
from sim.measure import (
    measure_calibration,
    measure_events,
    measure_tracks,
    measure_triangulation,
    thresholds,
)
from sim.pipeline import perfect_calibration

from ml.geometry.calibration import check_drift

TH = thresholds()


def test_limit_calibration_fails_beyond_one_and_a_half_pixels_of_click_noise() -> None:
    low = PROFILES["low"]
    at_two = measure_calibration(dataclasses.replace(low, mark_px=2.0), trials=20)
    assert at_two.rejected >= 0.9 * at_two.total
    at_one_and_a_half = measure_calibration(dataclasses.replace(low, mark_px=1.5), trials=20)
    assert at_one_and_a_half.rejected >= 0.5 * at_one_and_a_half.total


def test_limit_a_small_camera_knock_goes_unnoticed_by_the_daily_check() -> None:
    cam = make_camera("A", TH.court)
    cal = perfect_calibration(cam, TH)
    rng = random.Random(0)
    clean = marked_points(cam, TH.court, rng, PROFILES["low"])
    assert not check_drift(cal, clean + np.array([2.0, 1.0]), TH.court, TH.calibration).moved
    assert check_drift(cal, clean + np.array([6.0, 3.0]), TH.court, TH.calibration).moved


def test_limit_gaps_are_not_bridged_when_the_detector_goes_blind_for_long() -> None:
    s = measure_tracks(PROFILES["extreme"], range(10))
    assert s.gap_filled_ok / s.gap_frames < 0.8


def test_limit_three_frames_are_not_enough_for_the_speed_of_the_ball() -> None:
    s = measure_triangulation(PROFILES["medium"], range(10))
    assert np.median(s.speed_err_pct[3]) > 10.0


def test_limit_shots_and_bounces_fall_apart_with_a_blind_and_noisy_detector() -> None:
    ev = measure_events(PROFILES["extreme"], range(10))
    assert ev.shots.f1 < 0.85
    assert ev.bounces.recall < 0.7


def test_limit_bounces_at_the_analysis_rate_lose_recall() -> None:
    ev = measure_events(PROFILES["medium"], range(10), fps=25.0)
    assert ev.bounces.recall < 0.85
    assert ev.bounces.precision > 0.95


def test_limit_contacts_closer_than_the_separation_are_one_event() -> None:
    ev = measure_events(PROFILES["medium"], range(10))
    assert ev.merged_contacts > 0
    assert TH.bounces.min_separation_ms == 120.0
