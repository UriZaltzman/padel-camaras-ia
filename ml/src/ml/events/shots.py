"""Stage 7: shot detection (issue #127, spec 5.7).

There is a shot when the ball changes direction by more than ``min_direction_change_deg`` or
changes speed abruptly, within ``max_wrist_distance_m`` of a player's wrist. The shot belongs
to the player whose wrist is closest. A velocity change that a wall, the floor or the net
explains (a reflection) is a bounce, not a shot.
"""

from __future__ import annotations

import numpy as np

from ml.events.contacts import bounce_fit, surface_contacts
from ml.events.kinematics import (
    Kink,
    KinkFit,
    all_kinks,
    centred_candidates,
    refine_kink,
    to_track,
)
from ml.events.records import WristSample
from ml.geometry.consts import MS_PER_S, THREE
from ml.geometry.court import SurfacePlan
from ml.schemas import BallObservation, BallPosition, CourtPosition, ShotEvent
from ml.thresholds import Thresholds


def _is_hit_like(kink: Kink, th: Thresholds) -> float:
    """How strongly the kink looks like a hit (>= 1 qualifies, 0 if it does not)."""
    sh = th.shots
    score = 0.0
    if (
        kink.speed_before >= sh.min_speed_for_direction_mps
        and kink.speed_after >= sh.min_speed_for_direction_mps
    ):
        score = max(score, kink.direction_change_deg / sh.min_direction_change_deg)
    score = max(score, kink.speed_change_share / sh.min_speed_change_share)
    return score if score >= 1.0 else 0.0


def _closest_wrist(
    kink: Kink, wrists: list[WristSample], th: Thresholds
) -> tuple[WristSample, float] | None:
    """Wrist (any time within the slack) closest to the ball at the kink."""
    t_ms = kink.time_s * MS_PER_S
    best: tuple[WristSample, float] | None = None
    use_height = kink.dims == THREE
    for w in wrists:
        if abs(w.time_ms - t_ms) > th.shots.wrist_time_slack_ms:
            continue
        dx = w.x_m - float(kink.position[0])
        dy = w.y_m - float(kink.position[1])
        dz = 0.0
        if use_height and w.z_m is not None:
            dz = w.z_m - float(kink.position[THREE - 1])
        d = float(np.sqrt(dx * dx + dy * dy + dz * dz))
        if best is None or d < best[1]:
            best = (w, d)
    return best


def detect_shots(
    observations: list[BallObservation],
    wrists: list[WristSample],
    plan: SurfacePlan,
    th: Thresholds,
) -> list[ShotEvent]:
    """Shots in time order, each attributed to the player with the closest wrist."""
    track = to_track(observations)
    fit = KinkFit(
        th.shots.fit_window_ms / MS_PER_S,
        th.shots.fit_guard_ms / MS_PER_S,
        th.shots.min_fit_points,
        th.ball.gravity_mps2,
    )
    kinks = all_kinks(track, fit)
    contact_times = [
        kink.time_s for kink, _ in surface_contacts(track, bounce_fit(th), plan, th.court, th)
    ]
    exclusion = th.shots.contact_exclusion_ms / MS_PER_S
    scored: list[tuple[float, Kink, WristSample]] = []
    hit_like = [k for k in centred_candidates(kinks) if _is_hit_like(k, th) > 0.0]
    for kink in hit_like:
        if any(abs(kink.time_s - t) <= exclusion for t in contact_times):
            continue  # explained by a surface, or too close to one to tell: a bounce
        kink = refine_kink(track, kink, fit)  # noqa: PLW2901 - the centred kink replaces it
        score = _is_hit_like(kink, th)
        if score == 0.0:
            continue
        near = _closest_wrist(kink, wrists, th)
        if near is None or near[1] > th.shots.max_wrist_distance_m:
            continue
        scored.append((score, kink, near[0]))
    scored.sort(key=lambda s: -s[0])
    kept: list[tuple[float, Kink, WristSample]] = []
    gap = th.shots.min_separation_ms / MS_PER_S
    for item in scored:
        if all(abs(item[1].time_s - k[1].time_s) >= gap for k in kept):
            kept.append(item)
    kept.sort(key=lambda s: s[1].time_s)
    return [
        ShotEvent(
            time_ms=max(round(kink.time_s * MS_PER_S), 0),
            track_id=wrist.track_id,
            player_position=CourtPosition(x_m=wrist.foot_x_m, y_m=wrist.foot_y_m),
            ball_position=BallPosition(
                x_m=float(kink.position[0]),
                y_m=float(kink.position[1]),
                z_m=None if kink.dims != THREE else float(kink.position[THREE - 1]),
            ),
            confidence=float(score / (score + 1.0)),
        )
        for score, kink, wrist in kept
    ]
