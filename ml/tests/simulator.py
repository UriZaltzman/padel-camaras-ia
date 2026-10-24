"""Padel match simulator with known ground truth and injectable detection noise.

``simulate_match`` plays a whole match point by point with the real scoring and serve rotation
and writes, for each point, the shots and bounces a perfect detector would report: serve
faults, rallies with walls and contrapared, and every way a point can end in spec section 6.
``add_noise`` then degrades those events the way the real detectors fail: missed bounces and
shots, a wrong surface, a shot given to the wrong player and the ball lost for several seconds.

Assumption about confidences (documented in docs/ml/score-engine.md): a wrong detection has a
low confidence most of the time (``LOW_CONFIDENCE_SHARE``) and a normal one otherwise, so the
simulation includes errors the confidence cannot see.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from ml.labels import Team
from ml.point.events import BallSurface, BounceIn, RallyEvent, ShotIn
from ml.point.pipeline import FinalScore
from ml.point.state import MatchSetup, MatchState, advance, server_of, team_side
from ml.schemas import CourtSide
from ml.scoring import MatchFormat
from ml.thresholds import ScoringRules

SETUP = MatchSetup(team_players=((1, 2), (3, 4)), first_server=1, second_server=3)
LOW_CONFIDENCE_SHARE = 0.65
GLASS = (BallSurface.BACK_GLASS, BallSurface.SIDE_GLASS)
WALLS = (*GLASS, BallSurface.FENCE)


@dataclass(frozen=True)
class NoiseConfig:
    missed_bounce: float = 0.0
    missed_shot: float = 0.0
    wrong_surface: float = 0.0
    wrong_attribution: float = 0.0
    ball_lost: float = 0.0
    """Probability per point of losing the ball for 4.5 to 8 seconds."""

    @classmethod
    def uniform(cls, rate: float) -> NoiseConfig:
        return cls(rate, rate / 2, rate, rate, rate)


@dataclass(frozen=True)
class TruePoint:
    winner: Team
    start_ms: int
    end_ms: int


@dataclass(frozen=True)
class TrueMatch:
    events: list[RallyEvent]
    points: list[TruePoint]
    final: FinalScore
    fmt: MatchFormat
    setup: MatchSetup
    end_ms: int

    @property
    def winners(self) -> list[Team]:
        return [p.winner for p in self.points]


def _other(team: Team) -> Team:
    return Team.TWO if team is Team.ONE else Team.ONE


def _opposite(side: CourtSide) -> CourtSide:
    return CourtSide.B if side is CourtSide.A else CourtSide.A


class _Writer:
    """Collects the events of one match; indexes are assigned at the end."""

    def __init__(self, rng: random.Random) -> None:
        self.rng = rng
        self.events: list[RallyEvent] = []

    def conf(self) -> float:
        return min(0.995, max(0.75, self.rng.gauss(0.93, 0.04)))

    def shot(self, t: int, player: int, side: CourtSide, *, serve: bool = False) -> None:
        self.events.append(
            ShotIn(
                index=0, time_ms=t, player=player, side=side, confidence=self.conf(), is_serve=serve
            )
        )

    def bounce(
        self, t: int, surface: BallSurface, half: CourtSide, *, box: bool | None = None
    ) -> None:
        self.events.append(
            BounceIn(
                index=0,
                time_ms=t,
                surface=surface,
                half=half,
                confidence=self.conf(),
                in_service_box=box,
            )
        )


def _gap(rng: random.Random, low: float, high: float) -> int:
    return round(rng.uniform(low, high) * 1000)


@dataclass
class _Court:
    """Who stands where for the point being written."""

    sides: dict[Team, CourtSide]
    server: Team
    server_player: int
    teams: dict[Team, tuple[int, int]]

    def side(self, team: Team) -> CourtSide:
        return self.sides[team]

    def player(self, rng: random.Random, team: Team) -> int:
        return rng.choice(self.teams[team])


def _serve_fault(w: _Writer, c: _Court, t: int) -> int:
    rng = w.rng
    rec = c.side(_other(c.server))
    w.shot(t, c.server_player, c.side(c.server), serve=True)
    kind = rng.choices(["nobox", "net", "own", "glass", "out", "fence"], [35, 20, 10, 15, 10, 10])[
        0
    ]
    t += _gap(rng, 0.5, 0.8)
    if kind == "nobox":
        w.bounce(t, BallSurface.FLOOR, rec, box=False)
    elif kind == "net":
        w.bounce(t, BallSurface.NET, rec)
    elif kind == "own":
        w.bounce(t, BallSurface.FLOOR, c.side(c.server), box=True)
    elif kind == "glass":
        w.bounce(t, BallSurface.BACK_GLASS, rec)
    elif kind == "out":
        w.bounce(t, BallSurface.OUT, rec)
    else:
        w.bounce(t, BallSurface.FLOOR, rec, box=True)
        t += _gap(rng, 0.3, 0.6)
        w.bounce(t, BallSurface.FENCE, rec)
    return t


def _after_floor_ending(
    w: _Writer, loser_side: CourtSide, t: int, *, walls: tuple[BallSurface, ...] = WALLS
) -> int:
    """The ball bounced on the loser's half and the loser never hits it."""
    rng = w.rng
    ending = rng.choices(["double", "out", "wall_double"], [55, 25, 20])[0]
    t += _gap(rng, 0.5, 0.9)
    if ending == "double":
        w.bounce(t, BallSurface.FLOOR, loser_side)
    elif ending == "out":
        w.bounce(t, BallSurface.OUT, loser_side)
    else:
        w.bounce(t, rng.choice(walls), loser_side)
        t += _gap(rng, 0.3, 0.6)
        w.bounce(t, BallSurface.FLOOR, loser_side)
    return t


def _error_ending(w: _Writer, hitter_side: CourtSide, t: int) -> int:
    """The last hitter loses the point with a fault."""
    rng = w.rng
    rival_side = _opposite(hitter_side)
    ending = rng.choices(["own_floor", "net", "wall", "out"], [30, 25, 30, 15])[0]
    t += _gap(rng, 0.4, 0.8)
    if ending == "own_floor":
        w.bounce(t, BallSurface.FLOOR, hitter_side)
    elif ending == "net":
        w.bounce(t, BallSurface.NET, hitter_side)
        if rng.random() < 0.5:
            t += _gap(rng, 0.2, 0.4)
            w.bounce(t, BallSurface.FLOOR, hitter_side)
    elif ending == "wall":
        w.bounce(t, rng.choice(WALLS), rival_side)
    else:
        w.bounce(t, BallSurface.OUT, rival_side)
    return t


def _rally_length(rng: random.Random, winner: Team, server: Team, *, error_ending: bool) -> int:
    """Number of rally hits after the serve so the point ends in favour of ``winner``."""
    length = rng.choices(range(12), [8, 14, 14, 13, 11, 9, 8, 6, 5, 4, 4, 4])[0]
    server_wins = winner is server
    want_even = server_wins != error_ending  # even hits: the server hit last (or the serve)
    if error_ending and length == 0:
        length = 1
    if (length % 2 == 0) != want_even:
        length += 1
    return length


def _write_point(w: _Writer, c: _Court, winner: Team, t0: int) -> tuple[int, int]:
    """Write one point; returns (start_ms, end_ms)."""
    rng = w.rng
    server, receiver = c.server, _other(c.server)
    start = t0
    t = t0
    double_fault = winner is receiver and rng.random() < 0.12
    if double_fault:
        t = _serve_fault(w, c, t)
        t += _gap(rng, 8, 18)
        return start, _serve_fault(w, c, t)
    if rng.random() < 0.10:
        t = _serve_fault(w, c, t)
        t += _gap(rng, 8, 18)
    w.shot(t, c.server_player, c.side(server), serve=True)
    t += _gap(rng, 0.5, 0.8)
    w.bounce(t, BallSurface.FLOOR, c.side(receiver), box=True)

    error = rng.random() < 0.40
    length = _rally_length(rng, winner, server, error_ending=error)
    hitter = server
    for k in range(1, length + 1):
        hitter = receiver if k % 2 else server
        t += _gap(rng, 0.5, 1.4)
        w.shot(t, c.player(rng, hitter), c.side(hitter), serve=False)
        last = k == length
        if last and error:
            return start, _error_ending(w, c.side(hitter), t)
        if rng.random() < 0.05 and not last:
            t += _gap(rng, 0.2, 0.4)
            w.bounce(t, rng.choice(WALLS), c.side(hitter))
        t += _gap(rng, 0.4, 0.7)
        landing = c.side(_other(hitter))
        w.bounce(t, BallSurface.FLOOR, landing)
        if last:
            return start, _after_floor_ending(w, landing, t)
        if rng.random() < 0.30:
            t += _gap(rng, 0.3, 0.6)
            w.bounce(t, rng.choice(WALLS), landing)
    # length == 0: an ace the receiver never touches
    # The fence after the serve bounce is a fault (A2): an ace can only touch the glass.
    return start, _after_floor_ending(w, c.side(receiver), t, walls=GLASS)


def simulate_match(seed: int, rules: ScoringRules, *, fmt: MatchFormat | None = None) -> TrueMatch:
    rng = random.Random(seed)
    fmt = fmt or MatchFormat(golden_point=rng.random() < 0.5, super_tiebreak=rng.random() < 0.5)
    strength = rng.uniform(0.38, 0.62)
    writer = _Writer(rng)
    state = MatchState()
    points: list[TruePoint] = []
    teams = {Team.ONE: SETUP.team_players[0], Team.TWO: SETUP.team_players[1]}
    t = _gap(rng, 5, 30)
    end_ms = t
    while not state.over:
        server_player = server_of(state, SETUP, rules)
        server = SETUP.team_of[server_player]
        side_one = team_side(state, SETUP, Team.ONE)
        court = _Court(
            sides={Team.ONE: side_one, Team.TWO: _opposite(side_one)},
            server=server,
            server_player=server_player,
            teams=teams,
        )
        winner = Team.ONE if rng.random() < strength else Team.TWO
        start, end = _write_point(writer, court, winner, t)
        points.append(TruePoint(winner, start, end))
        state = advance(state, winner, rules, fmt)
        end_ms = end
        t = end + _gap(rng, 10, 25)
    final = FinalScore(sets=state.sets)
    return TrueMatch(reindex(writer.events), points, final, fmt, SETUP, end_ms + 20000)


def reindex(events: list[RallyEvent]) -> list[RallyEvent]:
    """Sort by time and number shots and bounces separately, as the stage lists would."""
    out: list[RallyEvent] = []
    counters = {"shot": 0, "bounce": 0}
    for event in sorted(events, key=lambda e: (e.time_ms, e.kind != "shot")):
        out.append(event.model_copy(update={"index": counters[event.kind]}))
        counters[event.kind] += 1
    return out


def _wrong_confidence(rng: random.Random, normal: float) -> float:
    if rng.random() < LOW_CONFIDENCE_SHARE:
        return rng.uniform(0.45, 0.8)
    return normal


def add_noise(match: TrueMatch, noise: NoiseConfig, seed: int) -> list[RallyEvent]:
    """Degrade the clean events of ``match``; deterministic for a given seed."""
    rng = random.Random(seed)
    events = list(match.events)
    # The ball lost for several seconds, once per affected point.
    for point in match.points:
        if rng.random() >= noise.ball_lost:
            continue
        inside = [e for e in events if point.start_ms <= e.time_ms <= point.end_ms]
        if not inside:
            continue
        begin = rng.choice(inside).time_ms
        until = begin + _gap(rng, 4.5, 8)
        events = [e for e in events if not begin <= e.time_ms <= until]
    out: list[RallyEvent] = []
    for original in events:
        if isinstance(original, ShotIn):
            if rng.random() < noise.missed_shot:
                continue
            shot = original
            if rng.random() < noise.wrong_attribution:
                shot = _misattribute(rng, shot)
            out.append(shot)
            continue
        if rng.random() < noise.missed_bounce:
            continue
        bounce = original
        if rng.random() < noise.wrong_surface:
            bounce = _wrong_surface(rng, bounce)
        out.append(bounce)
    return reindex(out)


def _misattribute(rng: random.Random, shot: ShotIn) -> ShotIn:
    team = SETUP.team_of[shot.player]
    own = SETUP.team_players[0] if team is Team.ONE else SETUP.team_players[1]
    rival = SETUP.team_players[1] if team is Team.ONE else SETUP.team_players[0]
    pool = [p for p in own if p != shot.player] if rng.random() < 0.7 else list(rival)
    return shot.model_copy(
        update={"player": rng.choice(pool), "confidence": _wrong_confidence(rng, shot.confidence)}
    )


def _wrong_surface(rng: random.Random, bounce: BounceIn) -> BounceIn:
    options = [s for s in BallSurface if s is not bounce.surface]
    update: dict[str, object] = {
        "surface": rng.choice(options),
        "confidence": _wrong_confidence(rng, bounce.confidence),
    }
    if bounce.in_service_box is not None:
        update["in_service_box"] = not bounce.in_service_box
    return bounce.model_copy(update=update)
