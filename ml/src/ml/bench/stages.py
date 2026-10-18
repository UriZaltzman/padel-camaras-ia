"""Placeholder stages with a small, real CPU cost. Phase 2 replaces them with the models."""

from __future__ import annotations

import hashlib

from ml.bench.harness import Frame, Stage


def _digest(frame: Frame) -> bytes:
    return hashlib.blake2b(frame.pixels).digest()


def _sample_rows(frame: Frame) -> int:
    row = frame.width_px
    return sum(frame.pixels[i] for i in range(0, len(frame.pixels), row))


def dummy_stages() -> list[Stage]:
    """Stand-ins for player detection, ball heatmap and tracking (spec section 5)."""
    return [
        Stage("players", _digest),
        Stage("ball", _digest),
        Stage("tracking", _sample_rows),
    ]
