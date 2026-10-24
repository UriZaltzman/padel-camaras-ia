"""Print the measured tables of the geometry and event algorithms (markdown).

Run it with ``uv run --directory ml python tests/sim/report.py``. The same functions back the
acceptance tests, so the numbers in the pull request and in docs/ml are the ones CI checks.
"""

from __future__ import annotations

import dataclasses
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sim.camera import PROFILES
from sim.measure import (
    SPEED_FRAMES,
    EventStats,
    measure_calibration,
    measure_corners,
    measure_events,
    measure_tracks,
    measure_triangulation,
)

SEEDS = range(10)
DRIFT_SHIFTS_PX = (0.0, 1.0, 2.0, 4.0, 8.0, 16.0)
CLICK_SWEEP_PX = (0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0)
LEVELS = ("low", "medium", "high", "extreme")


def _pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def _p(values: list[float], q: float) -> float:
    return float(np.percentile(values, q)) if values else float("nan")


def _row(cells: list[str]) -> str:
    return "| " + " | ".join(cells) + " |"


def table(header: list[str], rows: list[list[str]]) -> str:
    return "\n".join([_row(header), _row(["---"] * len(header)), *(_row(r) for r in rows)])


def calibration_table() -> str:
    rows = []
    base = PROFILES["low"]
    for click in CLICK_SWEEP_PX:
        noise = dataclasses.replace(base, mark_px=click)
        c = measure_calibration(noise, trials=20)
        rows.append(
            [
                f"{click}",
                _pct(c.rejected / c.total),
                f"{np.mean(c.in_sample_cm):.1f}" if c.in_sample_cm else "-",
                f"{np.mean(c.grid_mean_cm):.1f}" if c.grid_mean_cm else "-",
                f"{_p(c.grid_mean_cm, 95):.1f}" if c.grid_mean_cm else "-",
                f"{np.max(c.grid_max_cm):.1f}" if c.grid_max_cm else "-",
            ]
        )
    return table(
        [
            "Click error (px)",
            "Rejected (> 5 cm)",
            "Mean error on the 12 points (cm)",
            "Mean error on a 1 m floor grid (cm)",
            "p95 of that mean (cm)",
            "Worst grid point (cm)",
        ],
        rows,
    )


def track_table() -> str:
    rows = []
    for level in LEVELS:
        s = measure_tracks(PROFILES[level], SEEDS)
        rows.append(
            [
                level,
                _pct(s.gap_filled_ok / s.gap_frames),
                _pct(s.long_gap_filled / s.long_gap_frames),
                _pct(s.false_rejected / s.false_total),
                _pct(s.true_rejected / s.true_total),
                f"{np.mean(s.raw_err_px):.2f} -> {np.mean(s.smooth_err_px):.2f}",
            ]
        )
    return table(
        [
            "Noise",
            "Gap-fill recall (gaps <= 10 frames)",
            "Frames filled in gaps > 10",
            "Impossible jumps rejected",
            "Good detections lost",
            "Position error raw -> smoothed (px)",
        ],
        rows,
    )


def triangulation_table() -> str:
    rows = []
    heights: dict[str, dict[str, float]] = {}
    for level in LEVELS:
        s = measure_triangulation(PROFILES[level], SEEDS)
        heights[level] = {k: _p(v, 50) for k, v in s.z_err_by_height.items()}
        rows.append(
            [
                level,
                _pct(s.frames_3d / s.frames),
                f"{_p(s.err_cm, 50):.1f} / {_p(s.err_cm, 95):.1f}",
                f"{_p(s.z_err_cm, 50):.1f} / {_p(s.z_err_cm, 95):.1f}",
                f"{np.mean(np.abs(s.offset_err_ms)):.2f}",
                *(f"{_p(s.speed_err_pct[f], 50):.0f}%" for f in SPEED_FRAMES),
            ]
        )
    return table(
        [
            "Noise",
            "Frames in 3D",
            "3D error median / p95 (cm)",
            "Height error median / p95 (cm)",
            "Clock offset error (ms)",
            *(f"Speed error, {f} frames" for f in SPEED_FRAMES),
        ],
        rows,
    )


def _event_row(label: str, ev: EventStats) -> list[str]:
    return [
        label,
        f"{ev.shots.f1:.3f}",
        f"{ev.shots.precision:.2f} / {ev.shots.recall:.2f}",
        _pct(ev.attributed / max(ev.shots.tp, 1)),
        f"{ev.bounces.f1:.3f}",
        f"{ev.bounces.precision:.2f} / {ev.bounces.recall:.2f}",
        _pct(ev.surface_ok / max(ev.bounces.tp, 1)),
    ]


EVENT_HEADER = [
    "Scenario",
    "Shot F1 (100 ms)",
    "Shot P / R",
    "Shooter right",
    "Bounce F1 (100 ms)",
    "Bounce P / R",
    "Surface right",
]


def event_table() -> str:
    rows = [_event_row(level, measure_events(PROFILES[level], SEEDS)) for level in LEVELS]
    return table(EVENT_HEADER, rows)


def variant_table() -> str:
    medium = PROFILES["medium"]
    rows = [
        _event_row("medium, 60 fps (reference)", measure_events(medium, SEEDS)),
        _event_row("medium, 25 fps (analysis rate)", measure_events(medium, SEEDS, fps=25.0)),
        _event_row("low, 25 fps", measure_events(PROFILES["low"], SEEDS, fps=25.0)),
        _event_row(
            "medium, wrist without height", measure_events(medium, SEEDS, wrist_height=False)
        ),
        _event_row("medium, one camera only", measure_events(medium, SEEDS, cameras="A")),
    ]
    return table(EVENT_HEADER, rows)


def corner_table() -> str:
    rows = []
    for level in ("low", "medium", "high"):
        c = measure_corners(PROFILES[level], range(60))
        rows.append(
            [
                level,
                str(c.contacts),
                _pct(c.surface_ok / max(c.detected, 1)),
                _pct(c.surface_ok_position_only / max(c.detected_position_only, 1)),
            ]
        )
    return table(
        [
            "Noise",
            "Contacts",
            "Surface right (velocity direction)",
            "Surface right (position only)",
        ],
        rows,
    )


def drift_table() -> str:
    """Daily check: a camera knocked by a few pixels, seen on the 12 reference points."""
    import random

    from ml.geometry.calibration import check_drift
    from sim.camera import make_camera, marked_points
    from sim.measure import thresholds
    from sim.pipeline import perfect_calibration

    th = thresholds()
    rows = []
    for shift in DRIFT_SHIFTS_PX:
        moved = 0
        shifts = []
        trials = 20
        for seed in range(trials):
            rng = random.Random(seed)
            cam = make_camera("A" if seed % 2 == 0 else "B", th.court)
            cal = perfect_calibration(cam, th)
            today = marked_points(cam, th.court, rng, PROFILES["medium"]) + np.array(
                [shift, shift / 2]
            )
            report = check_drift(cal, today, th.court, th.calibration)
            moved += int(report.moved)
            shifts.append(report.mean_shift_cm)
        rows.append([f"{shift}", f"{np.mean(shifts):.1f}", _pct(moved / trials)])
    return table(["Camera moved by (px)", "Mean line shift (cm)", "Support is warned"], rows)


def profiles_table() -> str:
    rows = [
        [
            n.name,
            f"{n.mark_px}",
            f"{n.ball_px}",
            _pct(n.dropout),
            f"{n.burst_start * 100:.0f}% x {n.burst_mean_frames:.0f} frames",
            _pct(n.false_positive),
            f"{n.wrist_m * 100:.0f}",
            f"{n.focal_error * 100:.1f}% / {n.distortion_error}",
            f"{n.clock_offset_ms:+.0f}",
        ]
        for n in (PROFILES[k] for k in LEVELS)
    ]
    return table(
        [
            "Noise",
            "Click (px)",
            "Ball (px)",
            "Dropout",
            "Bursts",
            "False hits",
            "Wrist (cm)",
            "Lens focal / k1 error",
            "B clock (ms)",
        ],
        rows,
    )


def build_report() -> str:
    parts = [
        ("Noise levels", profiles_table()),
        ("Calibration (issue 120)", calibration_table()),
        ("Daily check of the stored calibration (issue 120)", drift_table()),
        ("Ball track smoothing (issue 124)", track_table()),
        ("Triangulation and clock alignment (issue 125)", triangulation_table()),
        ("Shots and bounces, 10 rallies per row (issues 127 and 128)", event_table()),
        ("Other conditions", variant_table()),
        ("Balls sent into the back corners (issue 128)", corner_table()),
    ]
    return "\n\n".join(f"### {title}\n\n{body}" for title, body in parts)


if __name__ == "__main__":
    print(build_report())  # noqa: T201
