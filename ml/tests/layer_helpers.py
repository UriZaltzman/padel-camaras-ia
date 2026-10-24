"""Shared helpers for the correction-layer tests."""

from __future__ import annotations

from pathlib import Path

from simulator import SETUP, simulate_match

from ml.labels import Team
from ml.point.align import AlignConfig, Observed
from ml.point.state import plan_points, replay
from ml.scoring import MatchFormat
from ml.thresholds import load_thresholds

TH = load_thresholds()
RULES = TH.scoring
FMT = MatchFormat()
ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "packages" / "contracts" / "examples" / "match-results.example.json"


def truth(seed: int) -> tuple[list[Team], list[Observed]]:
    match = simulate_match(seed, RULES, fmt=FMT)
    winners = match.winners
    plans = plan_points(winners, SETUP, RULES, FMT)
    observed = [
        Observed(w, 0.9, p.server_team, p.server) for w, p in zip(winners, plans, strict=True)
    ]
    return winners, observed


def cfg(*, use_serve: bool = True) -> AlignConfig:
    return AlignConfig(SETUP, RULES, FMT, TH.point, use_serve=use_serve)


def winners_of(steps: tuple) -> list[Team]:  # type: ignore[type-arg]
    return [s.winner for s in steps if s.winner is not None]


def game_ending_indexes(winners: list[Team]) -> list[int]:
    ends = []
    previous = replay([], RULES, FMT)
    for i in range(len(winners)):
        state = replay(winners[: i + 1], RULES, FMT)
        if (state.sets, state.games) != (previous.sets, previous.games):
            ends.append(i)
        previous = state
    return ends
