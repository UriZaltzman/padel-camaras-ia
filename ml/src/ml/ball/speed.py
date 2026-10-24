"""Ball speed right after a shot, from the 3D track (spec section 7, "velocidad de la pelota")."""

from __future__ import annotations

import numpy as np

from ml.geometry.consts import HALF, MS_PER_S, THREE
from ml.schemas import BallObservation


def speed_after(
    observations: list[BallObservation], shot_time_ms: int, frames: int, *, gravity: float
) -> float | None:
    """Speed in m/s fitted on the ``frames`` observations after the shot.

    Gravity is removed before the line fit. Needs ``frames`` observations with height (a 2D
    position gives no speed) and returns None otherwise.
    """
    after = sorted(
        (o for o in observations if o.time_ms > shot_time_ms and o.position.z_m is not None),
        key=lambda o: o.time_ms,
    )[:frames]
    if len(after) < frames or frames < THREE - 1:
        return None
    t = np.array([(o.time_ms - shot_time_ms) / MS_PER_S for o in after])
    xyz = np.array(
        [[o.position.x_m, o.position.y_m, o.position.z_m or 0.0] for o in after], dtype=np.float64
    )
    xyz[:, THREE - 1] += HALF * gravity * t * t
    velocity = [float(np.polyfit(t, xyz[:, axis], 1)[0]) for axis in range(THREE)]
    return float(np.linalg.norm(velocity))
