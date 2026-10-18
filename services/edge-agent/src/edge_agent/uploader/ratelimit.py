"""Token bucket that caps upload bandwidth (bytes per second)."""

import time
from collections.abc import Callable


class TokenBucket:
    """Classic token bucket: ``rate`` bytes/s refill, at most ``burst`` bytes banked.

    ``take(n)`` blocks until ``n`` bytes are allowed. Requests larger than the burst are
    served in burst-sized slices, so the average rate holds for any chunk size.
    Clock and sleep are injectable so tests run without waiting.
    """

    def __init__(
        self,
        rate_bytes_per_s: int,
        burst_bytes: int,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if rate_bytes_per_s <= 0 or burst_bytes <= 0:
            msg = "rate and burst must be positive"
            raise ValueError(msg)
        self._rate = rate_bytes_per_s
        self._burst = burst_bytes
        self._clock = clock
        self._sleep = sleep
        self._tokens = float(burst_bytes)
        self._last = clock()

    def _refill(self) -> None:
        now = self._clock()
        self._tokens = min(self._burst, self._tokens + (now - self._last) * self._rate)
        self._last = now

    def take(self, n_bytes: int) -> None:
        remaining = n_bytes
        while remaining > 0:
            want = min(remaining, self._burst)
            self._refill()
            if self._tokens < want:
                self._sleep((want - self._tokens) / self._rate)
                self._refill()
            # After the sleep the deficit is covered (allowing for clock rounding).
            self._tokens -= want
            remaining -= want
