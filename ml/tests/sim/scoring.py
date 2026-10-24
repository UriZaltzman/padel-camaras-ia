"""Metrics: compare detected events with the simulator's ground truth."""

from __future__ import annotations

import random
from dataclasses import dataclass

import numpy as np

from ml.events.records import WristSample
from ml.schemas import BounceEvent, ShotEvent, Surface
from sim.camera import NoiseProfile
from sim.physics import Contact
from sim.rally import Hit, Rally

# Contacts closer than this are one event for the bounce stage (corner: wall + floor). The
# value is thresholds.bounces.min_separation_ms; a test keeps them equal.
RESOLUTION_S = 0.12
WARMUP_S = 0.25  # events this soon after the first hit have no earlier track to compare with


@dataclass(frozen=True)
class Matching:
    tp: int
    fp: int
    fn: int
    pairs: tuple[tuple[int, int], ...]  # (truth index, detection index)

    @property
    def precision(self) -> float:
        return self.tp / (self.tp + self.fp) if self.tp + self.fp else 1.0

    @property
    def recall(self) -> float:
        return self.tp / (self.tp + self.fn) if self.tp + self.fn else 1.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if p + r else 0.0


def match_times(truth_s: list[float], found_s: list[float], tolerance_s: float) -> Matching:
    """Greedy one-to-one matching in time order within a tolerance."""
    used: set[int] = set()
    pairs: list[tuple[int, int]] = []
    candidates = sorted(
        (abs(t - f), i, j)
        for i, t in enumerate(truth_s)
        for j, f in enumerate(found_s)
        if abs(t - f) <= tolerance_s
    )
    taken_truth: set[int] = set()
    for _, i, j in candidates:
        if i in taken_truth or j in used:
            continue
        taken_truth.add(i)
        used.add(j)
        pairs.append((i, j))
    tp = len(pairs)
    return Matching(tp, len(found_s) - tp, len(truth_s) - tp, tuple(pairs))


def truth_hits(rally: Rally) -> list[Hit]:
    """Hits with a ball flight before them: the first one starts the rally from rest."""
    return rally.hits[1:]


def wrist_samples(
    rally: Rally, fps: float, rng: random.Random, noise: NoiseProfile, with_height: bool = True
) -> list[WristSample]:
    """What the pose stage hands over: noisy wrist positions of the 4 players, per frame."""
    out: list[WristSample] = []
    n_frames = int(rally.duration_s * fps)
    for k in range(n_frames):
        t = k / fps
        for player in range(4):
            wx, wy, wz = rally.wrist_at(player, t)
            fx, fy = rally.foot_at(player, t)
            out.append(
                WristSample(
                    time_ms=round(t * 1000.0),
                    track_id=player,
                    x_m=wx + rng.gauss(0.0, noise.wrist_m),
                    y_m=wy + rng.gauss(0.0, noise.wrist_m),
                    z_m=(wz + rng.gauss(0.0, noise.wrist_m)) if with_height else None,
                    foot_x_m=fx,
                    foot_y_m=fy,
                )
            )
    return out


@dataclass(frozen=True)
class EventScores:
    shots: Matching
    shot_attribution_ok: int
    bounces: Matching
    surface_ok: int
    merged_contacts: int = 0


def score_events(
    rally: Rally, shots: list[ShotEvent], bounces: list[BounceEvent], tolerance_s: float
) -> EventScores:
    hits = truth_hits(rally)
    start_s = rally.hits[0].time_s + WARMUP_S
    shots = [e for e in shots if e.time_ms / 1000.0 >= start_s]
    bounces = [e for e in bounces if e.time_ms / 1000.0 >= start_s]
    s_match = match_times(
        [h.time_s for h in hits], [e.time_ms / 1000.0 for e in shots], tolerance_s
    )
    attributed = sum(1 for i, j in s_match.pairs if hits[i].player == shots[j].track_id)
    clusters = contact_clusters(rally.contacts, RESOLUTION_S)
    b_match = match_times(
        [c[0].time_s for c in clusters], [e.time_ms / 1000.0 for e in bounces], tolerance_s
    )
    surface_ok = sum(
        1 for i, j in b_match.pairs if bounces[j].surface in {c.surface for c in clusters[i]}
    )
    merged = len(rally.contacts) - len(clusters)
    return EventScores(s_match, attributed, b_match, surface_ok, merged)


def contact_clusters(contacts: list[Contact], resolution_s: float) -> list[list[Contact]]:
    """Group contacts that follow each other closer than the detector can separate."""
    clusters: list[list[Contact]] = []
    for contact in sorted(contacts, key=lambda c: c.time_s):
        if clusters and contact.time_s - clusters[-1][-1].time_s < resolution_s:
            clusters[-1].append(contact)
        else:
            clusters.append([contact])
    return clusters


def merge(a: Matching, b: Matching) -> Matching:
    return Matching(a.tp + b.tp, a.fp + b.fp, a.fn + b.fn, ())


def surfaces_of(rally: Rally) -> list[Surface]:
    return [c.surface for c in rally.contacts]


def median(values: list[float]) -> float:
    return float(np.median(values)) if values else float("nan")
