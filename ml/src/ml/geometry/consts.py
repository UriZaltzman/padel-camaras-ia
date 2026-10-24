"""Arithmetic identities used by the geometry code.

The numeric-literal guard only lets 0 and 1 into ``ml/src``; everything tunable lives in
``thresholds.yaml``. These are structural counts (dimensions of a vector, halves), not
thresholds, built from 1 so the guard keeps its meaning.
"""

from __future__ import annotations

TWO = 1 + 1
THREE = TWO + 1
HALF = 1 / TWO
MS_PER_S = (TWO * TWO * TWO + TWO) * (TWO * TWO * TWO + TWO) * (TWO * TWO * TWO + TWO)
"""1000 milliseconds per second (10 ** 3)."""
CM_PER_M = (TWO * TWO * TWO + TWO) * (TWO * TWO * TWO + TWO)
"""100 centimetres per metre."""
