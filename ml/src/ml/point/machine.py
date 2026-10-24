"""Point state machine (spec section 6, "Reglas que cierran un punto").

``PointMachine.feed`` reads shots and bounces in time order and returns a ``RawPoint`` each
time one of the 7 rules closes a point. The rules are evaluated in the table's order:

1. serve faults (first fault: wait for the second serve; second fault: receiver wins)
2. the hit ball bounces on the hitter's own floor before crossing
3. the hit ball touches the net and does not cross
4. after crossing, the first contact is the rival's wall, fence or outside, not the floor
5. after the rival floor bounce, a second floor bounce nobody hit
6. after the rival floor bounce, the ball leaves the court
7. the ball is not seen for ``ball_lost_timeout_s`` in the middle of a point

The team of a hitter comes from the side of the court where the hitter stood, so a wrong
player attribution inside a pair never changes who the point is given to.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from enum import StrEnum

from ml.labels import PointEndReason, Team
from ml.point.events import (
    BallSurface,
    BounceIn,
    EventRef,
    Position,
    RallyEvent,
    RawPoint,
    ShotIn,
)
from ml.point.rules import Fault, LostAfterShot, RuleOptions
from ml.schemas import CourtSide
from ml.thresholds import PointThresholds

MS_PER_S = timedelta(seconds=1) // timedelta(milliseconds=1)
"""Unit conversion, not a tunable threshold."""


class Phase(StrEnum):
    IDLE = "idle"
    SERVE_FLIGHT = "serve_flight"
    SERVE_RETRY = "serve_retry"
    RALLY = "rally"


def _other(team: Team) -> Team:
    return Team.TWO if team is Team.ONE else Team.ONE


def _opposite(side: CourtSide) -> CourtSide:
    return CourtSide.B if side is CourtSide.A else CourtSide.A


@dataclass
class PointMachine:
    """Feed it events in time order, then call ``finish``."""

    team_of: dict[Position, Team]
    thresholds: PointThresholds
    options: RuleOptions = field(default_factory=RuleOptions)

    phase: Phase = Phase.IDLE
    _results: list[RawPoint] = field(default_factory=list)
    # state of the open point
    _start_ms: int = 0
    _last_ms: int = 0
    _sides: dict[Team, CourtSide] = field(default_factory=dict)
    _server: Team | None = None
    _server_player: Position | None = None
    _faults: int = 0
    _hitter: Team = Team.ONE
    _rival_floor: int = 0
    _net_pending: bool = False
    _serving: bool = False
    _chain: list[float] = field(default_factory=list)
    _factor: float = 1.0
    _last: EventRef | None = None
    _last_was_shot: bool = False

    # ------------------------------------------------------------------ public

    def feed(self, event: RallyEvent) -> list[RawPoint]:
        """Process one event; returns the points it closed (zero, one or two)."""
        before = len(self._results)
        if self.phase in {Phase.SERVE_FLIGHT, Phase.RALLY} and self._timed_out(event.time_ms):
            self._close_lost()
        if isinstance(event, ShotIn):
            self._on_shot(event)
        else:
            self._on_bounce(event)
        return self._results[before:]

    def finish(self, end_ms: int | None = None) -> list[RawPoint]:
        """Close a point left open when the recording ends (rule 7)."""
        before = len(self._results)
        if self.phase in {Phase.SERVE_FLIGHT, Phase.RALLY} and (
            end_ms is None or self._timed_out(end_ms)
        ):
            self._close_lost()
        return self._results[before:]

    # ------------------------------------------------------------------ helpers

    def _timed_out(self, now_ms: int) -> bool:
        return now_ms - self._last_ms > self.thresholds.ball_lost_timeout_s * MS_PER_S

    def _team_on(self, side: CourtSide) -> Team | None:
        for team, team_side in self._sides.items():
            if team_side is side:
                return team
        return None

    def _touch(self, event: RallyEvent) -> None:
        self._last_ms = event.time_ms
        self._last = EventRef(kind=event.kind, index=event.index)
        self._chain.append(event.confidence)

    def _reset(self) -> None:
        self.phase = Phase.IDLE
        self._faults = 0
        self._rival_floor = 0
        self._net_pending = False
        self._serving = False
        self._chain = []
        self._factor = 1.0
        self._last = None
        self._last_was_shot = False
        self._server = None
        self._server_player = None

    def _confidence(self, factor: float = 1.0) -> float:
        value = self._factor * factor
        for c in self._chain:
            value *= c
        return min(1.0, max(0.0, value))

    def _close(self, loser: Team, reason: PointEndReason, *, factor: float = 1.0) -> None:
        server = self._server
        self._results.append(
            RawPoint(
                start_ms=self._start_ms,
                end_ms=max(self._last_ms, self._start_ms + 1),
                winner=_other(loser),
                reason=reason,
                confidence=self._confidence(factor),
                serve_faults=min(self._faults, self.thresholds.serves_per_point),
                server_player=self._server_player,
                server_team=server,
                deciding_event=self._last,
            )
        )
        self._reset()

    def _close_lost(self) -> None:
        """Rule 7: decide by the last valid event; the point is low confidence."""
        hitter = self._hitter
        if self._net_pending:
            loser = hitter
        elif self._rival_floor > 0:
            loser = _other(hitter)
        elif self.options.lost_after_shot is LostAfterShot.HITTER_LOSES:
            loser = hitter
        else:
            loser = _other(hitter)
        self._close(loser, PointEndReason.BALL_LOST, factor=self.thresholds.ball_lost_factor)

    # ------------------------------------------------------------------ shots

    def _on_shot(self, shot: ShotIn) -> None:
        if self.phase is Phase.IDLE:
            self._open_point(shot)
        elif self.phase is Phase.SERVE_RETRY:
            self._second_serve(shot)
        elif self.phase is Phase.SERVE_FLIGHT:
            self._shot_during_serve(shot)
        else:
            self._shot_in_rally(shot)

    def _open_point(self, shot: ShotIn) -> None:
        team = self.team_of[shot.player]
        self._sides = {team: shot.side, _other(team): _opposite(shot.side)}
        self._server = team
        self._server_player = shot.player
        self._start_ms = shot.time_ms
        self._begin_serve(shot, team)

    def _begin_serve(self, shot: ShotIn, team: Team) -> None:
        self.phase = Phase.SERVE_FLIGHT
        self._hitter = team
        self._rival_floor = 0
        self._net_pending = False
        self._serving = True
        self._chain = []
        self._factor = 1.0
        self._touch(shot)
        self._last_was_shot = True

    def _second_serve(self, shot: ShotIn) -> None:
        server = self._server
        assert server is not None  # noqa: S101 - SERVE_RETRY always has a server
        hitter = self._team_on(shot.side)
        if (
            hitter is not None
            and hitter is not server
            and self.options.receiver_hit_overrides_serve_fault
        ):
            # The "fault" was a good serve whose bounce was misread: the receiver played it.
            self._faults = 0
            self._rival_floor = 1
            self._factor *= self.thresholds.inferred_event_factor
            self.phase = Phase.RALLY
            self._serving = True
            self._shot_in_rally(shot)
            return
        self._begin_serve(shot, server)

    def _shot_during_serve(self, shot: ShotIn) -> None:
        """A shot while the serve is in the air: the receiver played it (volley/return)."""
        hitter = self._team_on(shot.side)
        if hitter is not None and hitter is not self._hitter:
            if self.options.serve_without_bounce_is_good:
                self._factor *= self.thresholds.inferred_event_factor
                self._rival_floor = 1
                self.phase = Phase.RALLY
                self._shot_in_rally(shot)
            return
        # The same pair hit twice: a duplicate detection; keep the latest as the serve.
        self._factor *= self.thresholds.anomaly_factor
        self._touch(shot)

    def _shot_in_rally(self, shot: ShotIn) -> None:
        team = self._team_on(shot.side) or _other(self._hitter)
        expected = _other(self._hitter)
        if self._serving:
            self._serving = False
        if team is self._hitter:
            self._factor *= self.thresholds.anomaly_factor
            if self._rival_floor > 0 and not self._net_pending:
                # The rival's return was missed; the same pair hit again.
                self._factor *= self.thresholds.inferred_event_factor
        elif team is not expected:  # pragma: no cover - only two teams exist
            return
        self._hitter = team
        self._rival_floor = 0
        self._net_pending = False
        self._chain = []
        self._touch(shot)
        self._last_was_shot = True

    # ------------------------------------------------------------------ bounces

    def _on_bounce(self, bounce: BounceIn) -> None:
        if self.phase in {Phase.IDLE, Phase.SERVE_RETRY}:
            return  # nothing in play: a stray detection
        if self.phase is Phase.SERVE_FLIGHT:
            self._bounce_during_serve(bounce)
        else:
            self._bounce_in_rally(bounce)

    def _fault(self, bounce: BounceIn) -> None:
        self._touch(bounce)
        self._faults += 1
        server = self._server
        assert server is not None  # noqa: S101 - a serve always has a server
        if self._faults >= self.thresholds.serves_per_point:
            self._close(server, PointEndReason.DOUBLE_FAULT)
            return
        self._chain = []
        self.phase = Phase.SERVE_RETRY

    def _bounce_during_serve(self, bounce: BounceIn) -> None:
        receiver_side = self._sides[_other(self._hitter)]
        if bounce.surface is BallSurface.NET:
            if self.options.serve_net_contact is Fault.FAULT:
                self._fault(bounce)
            else:
                self._touch(bounce)
            return
        good = (
            bounce.surface is BallSurface.FLOOR
            and bounce.half is receiver_side
            and bounce.in_service_box is not False
        )
        if not good:
            self._fault(bounce)
            return
        self._touch(bounce)
        self._rival_floor = 1
        self.phase = Phase.RALLY

    def _bounce_in_rally(self, bounce: BounceIn) -> None:
        hitter = self._hitter
        rival = _other(hitter)
        half = self._team_on(bounce.half)
        surface = bounce.surface
        if (
            self._rival_floor > 0
            and self._serving
            and surface in self.options.serve_fault_walls
            and half is rival
        ):
            self._serving = False
            self._fault(bounce)
            return
        if surface is BallSurface.NET:
            if self._rival_floor > 0:
                self._infer_return(rival)
                hitter = self._hitter
            self._touch(bounce)
            if self.options.net_cord_valid_in_rally:
                self._net_pending = True
            else:
                self._close(hitter, PointEndReason.NET)
            return
        if self._net_pending:
            if half is hitter or half is None:
                self._touch(bounce)
                self._close(hitter, PointEndReason.NET)
                return
            self._net_pending = False
        if self._rival_floor == 0:
            self._bounce_before_floor(bounce, half, hitter)
        else:
            self._bounce_after_floor(bounce, half, rival)

    def _infer_return(self, rival: Team) -> None:
        """The rival hit the ball but the shot was not detected: assume it."""
        self._factor *= self.thresholds.inferred_event_factor
        self._hitter = rival
        self._rival_floor = 0
        self._net_pending = False
        self._serving = False
        self._chain = []

    def _bounce_before_floor(self, bounce: BounceIn, half: Team | None, hitter: Team) -> None:
        rival = _other(hitter)
        surface = bounce.surface
        self._touch(bounce)
        if surface is BallSurface.FLOOR and half is rival:
            self._rival_floor = 1
            self._serving = False
        elif surface is BallSurface.FLOOR:
            self._close(hitter, PointEndReason.OWN_FLOOR)  # rule 2
        elif surface is BallSurface.OUT:
            if self.options.out_before_floor_loses_hitter:
                self._close(hitter, PointEndReason.DIRECT_WALL)
        elif half is rival:
            self._close(hitter, PointEndReason.DIRECT_WALL)  # rule 4
        elif not self.options.contrapared_valid:
            self._close(hitter, PointEndReason.OWN_FLOOR)
        # else: own wall before crossing (contrapared) keeps the point alive

    def _bounce_after_floor(self, bounce: BounceIn, half: Team | None, rival: Team) -> None:
        surface = bounce.surface
        hitter = _other(rival)
        if half is hitter and surface is not BallSurface.OUT:
            # The ball came back to the hitter's half: the rival hit it unseen.
            self._infer_return(rival)
            self._bounce_before_floor(bounce, half, rival)
            self._last_was_shot = False
            return
        self._touch(bounce)
        if surface is BallSurface.FLOOR:
            self._close(rival, PointEndReason.DOUBLE_BOUNCE)  # rule 5
        elif surface is BallSurface.OUT:
            self._close(rival, PointEndReason.OUT_OF_COURT)  # rule 6
        elif not self.options.wall_after_rival_floor_valid:
            self._close(rival, PointEndReason.OUT_OF_COURT)
        # else: wall after the rival floor bounce ("salida de pared"): still in play
