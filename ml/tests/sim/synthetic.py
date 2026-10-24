"""Hand-made ball tracks for unit tests: exact ballistic flights joined by chosen kinks."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ml.schemas import BallObservation, BallPosition

GRAVITY = 9.81


@dataclass(frozen=True)
class Leg:
    """A drag-free flight of ``duration_s`` from ``start`` with ``velocity``."""

    start: tuple[float, float, float]
    velocity: tuple[float, float, float]
    duration_s: float


def leg_end(leg: Leg) -> tuple[float, float, float]:
    t = leg.duration_s
    x, y, z = leg.start
    vx, vy, vz = leg.velocity
    return (x + vx * t, y + vy * t, z + vz * t - 0.5 * GRAVITY * t * t)


def leg_end_velocity(leg: Leg) -> tuple[float, float, float]:
    return (leg.velocity[0], leg.velocity[1], leg.velocity[2] - GRAVITY * leg.duration_s)


def observations(
    legs: list[Leg],
    fps: float = 60.0,
    noise_m: float = 0.0,
    seed: int = 0,
    with_height: bool = True,
) -> list[BallObservation]:
    """Sample consecutive legs at ``fps``; the second leg starts where the first ends."""
    rng = np.random.default_rng(seed)
    out: list[BallObservation] = []
    t0 = 0.0
    frame = 0
    for leg in legs:
        n = round(leg.duration_s * fps)
        for k in range(n):
            t = k / fps
            x, y, z = leg.start
            vx, vy, vz = leg.velocity
            pos = np.array([x + vx * t, y + vy * t, z + vz * t - 0.5 * GRAVITY * t * t])
            pos = pos + rng.normal(0.0, noise_m, 3) if noise_m else pos
            out.append(
                BallObservation(
                    frame=frame,
                    time_ms=round((t0 + t) * 1000),
                    confidence=0.9,
                    position=BallPosition(
                        x_m=float(pos[0]),
                        y_m=float(pos[1]),
                        z_m=float(pos[2]) if with_height else None,
                    ),
                )
            )
            frame += 1
        t0 += n / fps
    return out


def chain(
    start: tuple[float, float, float],
    steps: list[tuple[tuple[float, float, float], float]],
) -> list[Leg]:
    """Legs that follow each other: each step is (velocity at the start of the leg, duration)."""
    legs: list[Leg] = []
    pos = start
    for velocity, duration in steps:
        leg = Leg(pos, velocity, duration)
        legs.append(leg)
        pos = leg_end(leg)
    return legs
