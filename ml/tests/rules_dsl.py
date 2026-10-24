"""Tiny text format for the hand-written rule cases in ``tests/rules/*.yaml``.

One event per string, so a referee can read a case without reading Python::

    serve 1 @0          shot by player 1, flagged as a serve
    hit 3 @1500         any other shot by player 3
    floor B box @600    floor bounce on half B, inside the service box (also ``nobox``)
    back_glass A @900   a glass or fence bounce (back_glass, side_glass, fence)
    net @700            net contact
    out B @900          the ball left the court on half B

Players 1 and 2 are pair 1 and stand on side A; players 3 and 4 are pair 2 on side B.
An optional ``c=0.9`` sets the event confidence (default 0.9).
"""

from __future__ import annotations

from ml.labels import Team
from ml.point.events import BallSurface, BounceIn, RallyEvent, ShotIn
from ml.schemas import CourtSide

TEAM_OF = {1: Team.ONE, 2: Team.ONE, 3: Team.TWO, 4: Team.TWO}
DEFAULT_CONFIDENCE = 0.9


def parse_events(lines: list[str]) -> list[RallyEvent]:
    out: list[RallyEvent] = []
    shots = bounces = 0
    for line in lines:
        words = line.split()
        confidence = DEFAULT_CONFIDENCE
        time_ms = -1
        flags: list[str] = []
        for word in words[1:]:
            if word.startswith("@"):
                time_ms = int(word[1:])
            elif word.startswith("c="):
                confidence = float(word[2:])
            else:
                flags.append(word)
        assert time_ms >= 0, f"missing @time in {line!r}"
        kind = words[0]
        if kind in {"serve", "hit"}:
            player = int(flags[0])
            side = CourtSide.A if TEAM_OF[player] is Team.ONE else CourtSide.B
            out.append(
                ShotIn(
                    index=shots,
                    time_ms=time_ms,
                    player=player,
                    side=side,
                    confidence=confidence,
                    is_serve=kind == "serve",
                )
            )
            shots += 1
            continue
        half = next((CourtSide(f) for f in flags if f in {"A", "B"}), CourtSide.A)
        box = None if "box" not in flags and "nobox" not in flags else "box" in flags
        out.append(
            BounceIn(
                index=bounces,
                time_ms=time_ms,
                surface=BallSurface(kind),
                half=half,
                confidence=confidence,
                in_service_box=box,
            )
        )
        bounces += 1
    return out
