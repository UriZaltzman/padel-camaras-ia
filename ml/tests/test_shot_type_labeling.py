"""Labeling tool, shot-type mode: classify, reclassify, undo, counts and save round trip."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import pytest
from pydantic import ValidationError

from ml.labeling.actions import ActionRequest, Mode, SaveTarget, apply_action, session_state
from ml.labeling.config import Action, LabelingConfig, load_labeling_config
from ml.labeling.server import LOCALE_PATH
from ml.labeling.session import (
    ErrorCode,
    LabelingError,
    LabelingSession,
    new_uuid7,
    open_session,
    stored_shot_type_counts,
)
from ml.labels import read_label_set
from ml.schemas import ShotType, Surface

NUDGE_MS = 20
NOW = datetime(2026, 10, 18, 12, tzinfo=UTC)


@pytest.fixture
def session() -> LabelingSession:
    labeling = LabelingSession(new_uuid7())
    for time_ms in (1_000, 2_000, 3_000):
        labeling.add_shot(time_ms, track_id=0)
    labeling.add_bounce(1_500, Surface.FLOOR)
    return labeling


def _shot_ids(session: LabelingSession) -> list[UUID]:
    return [s.id for s in sorted(session.shots, key=lambda s: s.time_ms)]


def test_classify_selects_next_shot(session: LabelingSession) -> None:
    first, second, _ = _shot_ids(session)
    session.classify(first, ShotType.SERVE)
    assert session.shot_type_of(first) is ShotType.SERVE
    assert session.selected == second
    assert session.dirty


def test_reclassify_replaces_type(session: LabelingSession) -> None:
    first = _shot_ids(session)[0]
    session.classify(first, ShotType.FOREHAND)
    session.classify(first, ShotType.BANDEJA)
    assert len(session.shot_types) == 1
    assert session.shot_type_of(first) is ShotType.BANDEJA


def test_same_type_adds_no_undo_step(session: LabelingSession) -> None:
    first = _shot_ids(session)[0]
    session.classify(first, ShotType.LOB)
    session.classify(first, ShotType.LOB)
    session.undo()
    assert session.shot_type_of(first) is None


def test_undo_restores_previous_type(session: LabelingSession) -> None:
    first = _shot_ids(session)[0]
    session.classify(first, ShotType.SMASH)
    session.classify(first, ShotType.VIBORA)
    session.undo()
    assert session.shot_type_of(first) is ShotType.SMASH
    session.undo()
    assert session.shot_type_of(first) is None


def test_moving_a_shot_keeps_its_type_and_removing_drops_it(session: LabelingSession) -> None:
    first = _shot_ids(session)[0]
    session.classify(first, ShotType.SERVE)
    session.move(first, 500)
    assert session.shot_type_of(first) is ShotType.SERVE
    session.remove(first)
    assert session.shot_types == ()
    session.undo()
    assert session.shot_type_of(first) is ShotType.SERVE


def test_only_shots_can_be_classified(session: LabelingSession) -> None:
    with pytest.raises(LabelingError) as bounce:
        session.classify(session.bounces[0].id, ShotType.LOB)
    assert bounce.value.code is ErrorCode.NOT_A_SHOT
    with pytest.raises(LabelingError) as missing:
        session.classify(new_uuid7(), ShotType.LOB)
    assert missing.value.code is ErrorCode.EVENT_NOT_FOUND


def test_counts_per_type(session: LabelingSession) -> None:
    first, second, third = _shot_ids(session)
    session.classify(first, ShotType.SERVE)
    session.classify(second, ShotType.SERVE)
    session.classify(third, ShotType.UNKNOWN)
    counts = session.shot_type_counts()
    assert set(counts) == set(ShotType)
    assert counts[ShotType.SERVE] == 2
    assert counts[ShotType.UNKNOWN] == 1
    assert counts[ShotType.LOB] == 0
    others = {ShotType.SERVE: 10}
    state = session_state(session, others)
    assert state["shot_type_counts"]["serve"] == 12
    assert state["unclassified"] == 0


def test_next_unclassified_wraps_around(session: LabelingSession) -> None:
    first, second, third = _shot_ids(session)
    session.classify(second, ShotType.LOB)
    session.selected = third
    assert session.select_next_unclassified() == first
    session.classify(first, ShotType.LOB)
    session.classify(third, ShotType.LOB)
    assert session.select_next_unclassified() is None


def test_shot_steps_skip_bounces(session: LabelingSession) -> None:
    first, second, _ = _shot_ids(session)
    assert session.select_shot_step(1, time_ms=1_400) == first
    assert session.select_shot_step(1, time_ms=0) == second


def test_save_and_read_round_trip(session: LabelingSession, tmp_path: Path) -> None:
    first, second, _ = _shot_ids(session)
    session.classify(first, ShotType.BACKHAND_VOLLEY)
    session.classify(second, ShotType.OFF_THE_WALL)
    labeler = new_uuid7()
    session.save(tmp_path, labeler, NOW)
    stored = read_label_set(tmp_path, session.match_id)
    assert {(t.shot_id, t.shot_type) for t in stored.shot_types} == {
        (first, ShotType.BACKHAND_VOLLEY),
        (second, ShotType.OFF_THE_WALL),
    }
    reopened = open_session(tmp_path, session.match_id, session.camera)
    assert reopened.shot_type_of(first) is ShotType.BACKHAND_VOLLEY
    reopened.classify(first, ShotType.FOREHAND_VOLLEY)
    reopened.save(tmp_path, labeler, NOW)
    assert read_label_set(tmp_path, session.match_id).info.version == 2
    counts = stored_shot_type_counts(tmp_path)
    assert counts[ShotType.FOREHAND_VOLLEY] == 1
    assert counts[ShotType.BACKHAND_VOLLEY] == 0
    assert (
        stored_shot_type_counts(tmp_path, exclude=session.match_id)[ShotType.FOREHAND_VOLLEY] == 0
    )


def test_shortcut_actions_in_shot_type_mode(session: LabelingSession, tmp_path: Path) -> None:
    target = SaveTarget(tmp_path, new_uuid7())

    def press(action: Action, **extra: object) -> None:
        body = {"action": action, "time_ms": 0, "mode": Mode.SHOT_TYPE, **extra}
        apply_action(session, ActionRequest.model_validate(body), NUDGE_MS, target)

    first, second, _ = _shot_ids(session)
    press(Action.SELECT_NEXT)
    assert session.selected == first
    press(Action.CLASSIFY_SHOT, shot_type="serve")
    assert session.shot_type_of(first) is ShotType.SERVE
    assert session.selected == second
    press(Action.UNDO)
    assert session.shot_type_of(first) is None
    with pytest.raises(ValueError, match="shot_type"):
        press(Action.CLASSIFY_SHOT)


def test_config_has_a_key_per_type_and_target_in_config() -> None:
    config = load_labeling_config()
    assert {s.shot_type for s in config.shot_type.shortcuts} == set(ShotType)
    assert config.shot_type.target_per_type == 150
    assert config.shot_type.clip_before_ms + config.shot_type.clip_after_ms == 1_000


def test_config_rejects_bad_shot_type_keys() -> None:
    raw = load_labeling_config().model_dump(mode="json")
    section = raw["shot_type"]
    missing = {**section, "shortcuts": section["shortcuts"][:-1]}
    with pytest.raises(ValidationError, match="missing"):
        LabelingConfig.model_validate({**raw, "shot_type": missing})
    clash = [{**section["shortcuts"][0], "key": "z"}, *section["shortcuts"][1:]]
    with pytest.raises(ValidationError, match="clash"):
        LabelingConfig.model_validate({**raw, "shot_type": {**section, "shortcuts": clash}})


def test_locale_names_every_shot_type() -> None:
    texts = json.loads(LOCALE_PATH.read_text(encoding="utf-8"))
    assert set(texts["shot_types"]) == {t.value for t in ShotType}
    assert set(texts["modes"]) == {m.value for m in Mode}
