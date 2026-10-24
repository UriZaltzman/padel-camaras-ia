"""The whole score engine on simulated noisy matches, with explicit acceptance thresholds.

Every match is generated with a known winner for each point (``simulator.py``), degraded at a
given noise rate per event (missed bounces and shots, wrong surfaces, wrong shot attribution
and a ball lost for several seconds) and scored by the engine before and after each layer.
Seeds are fixed, so the numbers are exact and a change that lowers them fails the build.
The same study with more matches is printed by ``score_engine_report.py`` for the PR.
"""

from __future__ import annotations

from functools import cache

import pytest
from simulator import NoiseConfig, add_noise, simulate_match
from study import STAGES, Cell, run_study

from ml.point.pipeline import Layer, analyze
from ml.thresholds import load_thresholds

SEEDS = range(8)
LEVELS = (0.0, 0.02, 0.05, 0.10)
RAW, L1, L123 = tuple(STAGES)

MIN_ACCURACY_AFTER_ALL_LAYERS = {0.0: 1.0, 0.02: 0.95, 0.05: 0.90, 0.10: 0.80}
"""Share of points with the right winner. The 5% row is the bar of the product: 9 in 10."""
MIN_ACCURACY_RAW = {0.0: 1.0, 0.02: 0.94, 0.05: 0.88, 0.10: 0.78}
MAX_ACCURACY_LOSS_FROM_LAYERS = 0.02
"""A layer may move a few points either way but must not make the winners worse."""
MIN_FLAG_RECALL_AT_5_PERCENT = 0.5
"""Share of the wrong points that layer 2 marks for review."""
THRESHOLDS = load_thresholds()


@cache
def study() -> dict[float, dict[str, Cell]]:
    return run_study(LEVELS, SEEDS)


@pytest.mark.parametrize("level", LEVELS)
def test_winners_after_all_layers(level: float) -> None:
    assert study()[level][L123].accuracy >= MIN_ACCURACY_AFTER_ALL_LAYERS[level]


@pytest.mark.parametrize("level", LEVELS)
def test_winners_with_the_rules_alone(level: float) -> None:
    assert study()[level][RAW].accuracy >= MIN_ACCURACY_RAW[level]


@pytest.mark.parametrize("level", LEVELS)
def test_layers_do_not_make_the_winners_worse(level: float) -> None:
    cells = study()[level]
    assert cells[L1].accuracy >= cells[RAW].accuracy - MAX_ACCURACY_LOSS_FROM_LAYERS
    assert cells[L123].accuracy >= cells[RAW].accuracy - MAX_ACCURACY_LOSS_FROM_LAYERS


@pytest.mark.parametrize("level", LEVELS)
def test_a_final_score_entered_by_a_player_is_always_reproduced(level: float) -> None:
    cell = study()[level][L123]
    assert cell.score_exact == cell.matches


@pytest.mark.parametrize("level", [0.02, 0.05, 0.10])
def test_serve_coherence_recovers_scores_the_rules_alone_miss(level: float) -> None:
    cells = study()[level]
    assert cells[L1].score_exact > cells[RAW].score_exact


def test_clean_matches_are_scored_exactly_at_every_stage() -> None:
    for cell in study()[0.0].values():
        assert cell.accuracy == 1.0
        assert cell.score_exact == cell.matches


def test_layer_two_flags_most_of_the_wrong_points() -> None:
    cell = study()[0.05][L123]
    assert cell.flag_recall >= MIN_FLAG_RECALL_AT_5_PERCENT


def test_more_noise_means_less_accuracy() -> None:
    accuracy = [study()[level][RAW].accuracy for level in LEVELS]
    assert accuracy == sorted(accuracy, reverse=True)


def test_without_an_entered_score_the_rotation_still_helps() -> None:
    """No result entered: only layers 1 and 2 run, and the score is still usually right."""
    exact = 0
    for seed in SEEDS:
        truth = simulate_match(seed, THRESHOLDS.scoring)
        events = add_noise(truth, NoiseConfig.uniform(0.02), seed + 1000)
        result = analyze(
            events,
            truth.setup,
            truth.fmt,
            THRESHOLDS,
            layers=frozenset({Layer.SERVE_COHERENCE, Layer.CONFIDENCE}),
            end_ms=truth.end_ms,
        )
        exact += int(result.sets == truth.final.sets)
    assert exact >= len(SEEDS) - 2


def test_every_change_is_logged_for_retraining() -> None:
    truth = simulate_match(3, THRESHOLDS.scoring)
    events = add_noise(truth, NoiseConfig.uniform(0.05), 1003)
    result = analyze(events, truth.setup, truth.fmt, THRESHOLDS, final=truth.final)
    edited = [p for p in result.points if p.corrected is not None]
    assert result.corrections
    assert len(edited) <= len(result.corrections)
    assert all(p.needs_review for p in edited)
    assert all(c.layer in {Layer.SERVE_COHERENCE, Layer.FINAL_SCORE} for c in result.corrections)
