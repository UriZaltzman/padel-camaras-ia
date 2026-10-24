"""Stage 8: bounce detection with surface classification (issue #128).

A bounce is a kink of the 3D ball track that a surface explains. The surface comes from where
it happens (floor, back glass at y = 0 or y = length, side wall at x = 0 or x = width, net at
the net line) and from the glass-and-fence plan loaded for that court. With a single camera
there is no height: the fallback keeps kinks that no player's wrist can explain and picks the
surface from the apparent floor position only.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ml.events.contacts import bounce_fit, surface_contacts
from ml.events.kinematics import (
    Kink,
    all_kinks,
    centred_candidates,
    to_track,
)
from ml.events.records import WristSample
from ml.events.surfaces import SurfaceContact, nearest_surface_2d
from ml.geometry.consts import MS_PER_S, THREE
from ml.geometry.court import SurfacePlan
from ml.schemas import BallObservation, BallPosition, BounceEvent, CourtSide
from ml.thresholds import Thresholds


@dataclass(frozen=True)
class _Candidate:
    score: float
    kink: Kink
    contact: SurfaceContact | None  # None for the single-camera fallback


def _min_wrist_distance(kink: Kink, wrists: list[WristSample], slack_ms: float) -> float:
    t_ms = kink.time_s * MS_PER_S
    best = np.inf
    for w in wrists:
        if abs(w.time_ms - t_ms) > slack_ms:
            continue
        best = min(best, float(np.hypot(w.x_m - kink.position[0], w.y_m - kink.position[1])))
    return float(best)


def _fallback_candidate(kink: Kink, wrists: list[WristSample], th: Thresholds) -> _Candidate | None:
    """Without height: a hit-like kink that no wrist can explain."""
    hit_like = (
        kink.direction_change_deg >= th.shots.min_direction_change_deg
        or kink.speed_change_share >= th.shots.min_speed_change_share
    )
    if not hit_like:
        return None
    reach = _min_wrist_distance(kink, wrists, th.shots.wrist_time_slack_ms)
    if reach <= th.shots.max_wrist_distance_m:
        return None
    return _Candidate(kink.speed_before + kink.speed_after, kink, None)


def _non_maximum_suppression(items: list[_Candidate], gap_s: float) -> list[_Candidate]:
    kept: list[_Candidate] = []
    for item in sorted(items, key=lambda c: -c.score):
        if all(abs(item.kink.time_s - k.kink.time_s) >= gap_s for k in kept):
            kept.append(item)
    return sorted(kept, key=lambda c: c.kink.time_s)


def detect_bounces(
    observations: list[BallObservation],
    plan: SurfacePlan,
    th: Thresholds,
    wrists: list[WristSample] | None = None,
    *,
    use_velocity_direction: bool = True,
) -> list[BounceEvent]:
    """Bounces in time order. ``wrists`` are only needed for the single-camera fallback."""
    track = to_track(observations)
    fit = bounce_fit(th)
    heights = [o.position.z_m is not None for o in observations]
    share_3d = sum(heights) / len(heights) if heights else 0.0
    dual_camera = share_3d >= th.bounces.min_dual_camera_3d_share
    gap_s = th.bounces.min_separation_ms / MS_PER_S
    found: list[_Candidate] = [
        _Candidate(contact.normal_speed_change, kink, contact)
        for kink, contact in surface_contacts(
            track, fit, plan, th.court, th, use_velocity_direction=use_velocity_direction
        )
    ]
    if not dual_camera:  # with two cameras a floor-only kink is too unreliable
        for kink in centred_candidates(all_kinks(track, fit)):
            if kink.dims != THREE:
                fallback = _fallback_candidate(kink, wrists or [], th)
                if fallback is not None:
                    found.append(fallback)
    kept = _non_maximum_suppression(found, gap_s)
    events: list[BounceEvent] = []
    for item in kept:
        kink, contact = item.kink, item.contact
        if contact is not None:
            surface, side = contact.surface, contact.side
            z: float | None = float(kink.position[THREE - 1])
        else:
            surface = nearest_surface_2d(kink, plan, th.court, th.bounces)
            side = CourtSide.A if float(kink.position[1]) < th.court.net_y_m else CourtSide.B
            z = None
        events.append(
            BounceEvent(
                time_ms=max(round(kink.time_s * MS_PER_S), 0),
                surface=surface,
                position=BallPosition(
                    x_m=float(kink.position[0]), y_m=float(kink.position[1]), z_m=z
                ),
                side=side,
                confidence=item.score / (item.score + th.bounces.min_normal_speed_change_mps),
            )
        )
    return events
