"""Score the engine against a simulated match: points, winners and final score."""

from __future__ import annotations

from dataclasses import dataclass

from simulator import TrueMatch

from ml.point.pipeline import MatchResult


@dataclass(frozen=True)
class Outcome:
    points: int
    winners_correct: int
    score_correct: bool
    flagged: int
    flagged_wrong: int
    wrong: int
    point_count_correct: bool


def _overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> int:
    return max(0, min(a_end, b_end) - max(a_start, b_start))


def evaluate(truth: TrueMatch, result: MatchResult) -> Outcome:
    """Each true point is matched to the predicted point that overlaps it most in time."""
    correct = 0
    flagged_wrong = 0
    wrong = 0
    for point in truth.points:
        best = max(
            result.points,
            key=lambda p: _overlap(point.start_ms, point.end_ms, p.start_ms, p.end_ms),
            default=None,
        )
        overlapping = best is not None and (
            _overlap(point.start_ms, point.end_ms, best.start_ms, best.end_ms) > 0
        )
        if best is not None and overlapping and best.winner is point.winner:
            correct += 1
        else:
            wrong += 1
            flagged_wrong += int(best is not None and overlapping and best.needs_review)
    score_ok = result.sets == truth.final.sets and result.winner is not None
    return Outcome(
        points=len(truth.points),
        winners_correct=correct,
        score_correct=score_ok,
        flagged=sum(p.needs_review for p in result.points),
        flagged_wrong=flagged_wrong,
        wrong=wrong,
        point_count_correct=len(result.points) == len(truth.points),
    )
