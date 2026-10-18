"""UUID v7 identifiers (time-ordered), as required for every ID in the platform.

Python 3.12's ``uuid`` module has no v7, so it is built here following RFC 9562.
"""

import os
import time
from uuid import UUID

_MS_MASK = (1 << 48) - 1
_RAND_A_BITS = 12
_RAND_B_BITS = 62


def uuid7(unix_ms: int | None = None) -> UUID:
    """A new UUID v7. ``unix_ms`` fixes the timestamp (tests); random bits are always fresh."""
    ms = time.time_ns() // 1_000_000 if unix_ms is None else unix_ms
    rand = int.from_bytes(os.urandom(10), "big")
    rand_a = rand >> (80 - _RAND_A_BITS)
    rand_b = rand & ((1 << _RAND_B_BITS) - 1)
    value = (ms & _MS_MASK) << 80 | 0x7 << 76 | rand_a << 64 | 0b10 << 62 | rand_b
    return UUID(int=value)
