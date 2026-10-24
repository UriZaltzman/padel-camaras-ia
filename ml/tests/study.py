"""Run the engine on simulated noisy matches and measure it before and after each layer."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from evaluation import evaluate
from simulator import NoiseConfig, TrueMatch, add_noise, simulate_match

from ml.point.pipeline import FinalScore, Layer, MatchResult, analyze
from ml.thresholds import load_thresholds

THRESHOLDS = load_thresholds()
STAGES: dict[str, frozenset[Layer]] = {
    "raw (7 rules)": frozenset(),
    "+ layer 1": frozenset({Layer.SERVE_COHERENCE}),
    "+ layers 1-3": frozenset(Layer),
}
"""Layer 2 only flags points, so its winners are layer 1's; its flags are in every stage."""


@dataclass
class Cell:
    """Totals over the matches of one noise level and one stage."""

    matches: int = 0
    points: int = 0
    correct: int = 0
    score_exact: int = 0
    wrong: int = 0
    wrong_flagged: int = 0
    flagged: int = 0
    result_points: int = 0
    per_match: list[float] = field(default_factory=list)

    @property
    def accuracy(self) -> float:
        return self.correct / self.points

    @property
    def score_rate(self) -> float:
        return self.score_exact / self.matches

    @property
    def flag_recall(self) -> float:
        return self.wrong_flagged / self.wrong if self.wrong else 1.0

    @property
    def flag_share(self) -> float:
        return self.flagged / self.result_points


def run_match(
    truth: TrueMatch, noise: NoiseConfig, noise_seed: int, final: FinalScore | None
) -> dict[str, MatchResult]:
    events = add_noise(truth, noise, noise_seed)
    return {
        stage: analyze(
            events,
            truth.setup,
            truth.fmt,
            THRESHOLDS,
            layers=layers,
            final=final if Layer.FINAL_SCORE in layers else None,
            end_ms=truth.end_ms,
        )
        for stage, layers in STAGES.items()
    }


def run_study(
    levels: Sequence[float], seeds: Sequence[int], *, enter_final_score: bool = True
) -> dict[float, dict[str, Cell]]:
    """Cells by noise level and stage. The final score entered is the true one."""
    out: dict[float, dict[str, Cell]] = {}
    matches = {seed: simulate_match(seed, THRESHOLDS.scoring) for seed in seeds}
    for level in levels:
        cells = {stage: Cell() for stage in STAGES}
        for seed, truth in matches.items():
            results = run_match(
                truth,
                NoiseConfig.uniform(level),
                seed + 1000,
                truth.final if enter_final_score else None,
            )
            for stage, result in results.items():
                outcome = evaluate(truth, result)
                cell = cells[stage]
                cell.matches += 1
                cell.points += outcome.points
                cell.correct += outcome.winners_correct
                cell.score_exact += int(outcome.score_correct)
                cell.wrong += outcome.wrong
                cell.wrong_flagged += outcome.flagged_wrong
                cell.flagged += outcome.flagged
                cell.result_points += len(result.points)
                cell.per_match.append(outcome.winners_correct / outcome.points)
        out[level] = cells
    return out


def _recall(cell: Cell) -> str:
    return f"{cell.flag_recall:.0%}" if cell.wrong else "n/a"


def markdown_table(study: dict[float, dict[str, Cell]]) -> str:
    rows = [
        "| Noise per event | Stage | Points with the right winner | Final score exact "
        "| Wrong points flagged | Points flagged |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for level, cells in study.items():
        for stage, cell in cells.items():
            rows.append(
                f"| {level:.0%} | {stage} | {cell.accuracy:.1%} "
                f"| {cell.score_exact}/{cell.matches} | {_recall(cell)} "
                f"| {cell.flag_share:.0%} |"
            )
    return "\n".join(rows)
