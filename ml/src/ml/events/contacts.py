"""Surface contacts of a ball track: the kinks that a wall, the floor or the net explains.

Shared by shot detection (a contact is not a shot) and bounce detection (a contact is a bounce).
"""

from __future__ import annotations

import numpy as np

from ml.events.kinematics import (
    BallTrack,
    Kink,
    KinkFit,
    all_kinks,
    centred_candidates,
    refine_kink,
)
from ml.events.surfaces import SurfaceContact, classify_kink
from ml.geometry.consts import MS_PER_S, THREE
from ml.geometry.court import SurfacePlan
from ml.thresholds import CourtGeometry, Thresholds

CENTRING_REACH = THREE - 1


def bounce_fit(th: Thresholds) -> KinkFit:
    """Fit settings of the bounce stage (also used to find contacts inside shot detection)."""
    return KinkFit(
        th.bounces.fit_window_ms / MS_PER_S,
        th.bounces.fit_guard_ms / MS_PER_S,
        th.bounces.min_fit_points,
        th.ball.gravity_mps2,
    )


def surface_contacts(
    track: BallTrack,
    fit: KinkFit,
    plan: SurfacePlan,
    court: CourtGeometry,
    th: Thresholds,
    *,
    use_velocity_direction: bool = True,
) -> list[tuple[Kink, SurfaceContact]]:
    """Centred, refined 3D kinks that a surface explains, in time order."""
    out: list[tuple[Kink, SurfaceContact]] = []
    for kink in centred_candidates(all_kinks(track, fit), reach=CENTRING_REACH):
        if (
            kink.dims != THREE
            or float(np.linalg.norm(kink.delta_v)) < th.bounces.min_normal_speed_change_mps
        ):
            continue
        centred = refine_kink(track, kink, fit)
        contact = classify_kink(
            centred, plan, court, th.bounces, use_velocity_direction=use_velocity_direction
        )
        if contact is not None:
            out.append((centred, contact))
    return out
