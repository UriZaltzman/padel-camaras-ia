"""Labeling tool, points mode: mark, edit, delete, undo, overlap, round trip, score, server."""

from __future__ import annotations

import json
import threading
import urllib.request
from collections.abc import Iterator
from datetime import UTC, datetime
from http.server import ThreadingHTTPServer
from pathlib import Path
from threading import Lock

import pytest
from pydantic import ValidationError

from ml.labeling.actions import ActionRequest, Mode, SaveTarget, apply_action, session_state
from ml.labeling.config import Action, LabelingConfig, load_labeling_config
from ml.labeling.server import LOCALE_PATH, App, make_handler
from ml.labeling.session import ErrorCode, LabelingError, LabelingSession, new_uuid7, open_session
from ml.labels import PointEndReason, Team, read_label_set
from ml.schemas import Camera
from ml.scoring import ADVANTAGE_CALL, GAME_CALLS, MatchFormat, reconstruct_score
from ml.thresholds import ScoringRules, load_thresholds

NOW = datetime(2026, 10, 18, 12, tzinfo=UTC)
RULES = load_thresholds().scoring
ONE, TWO = Team.ONE, Team.TWO


@pytest.fixture
def session() -> LabelingSession:
    return LabelingSession(new_uuid7())


def _mark(session: LabelingSession, start: int, end: int, winner: Team = ONE) -> None:
    session.start_point(start)
    session.end_point(end, winner)


# -- session ------------------------------------------------------------------------------


def test_add_point_numbers_in_time_order_and_selects_it(session: LabelingSession) -> None:
    _mark(session, 5_000, 9_000, TWO)
    _mark(session, 1_000, 4_000, ONE)
    assert [(p.number, p.start_ms, p.winner) for p in session.points] == [
        (1, 1_000, ONE),
        (2, 5_000, TWO),
    ]
    assert session.selected == session.points[0].id
    assert [p.end_reason for p in session.points] == [PointEndReason.OTHER] * 2
    assert session.pending_point_start is None
    assert session.dirty


def test_end_needs_a_start_and_must_come_after_it(session: LabelingSession) -> None:
    with pytest.raises(LabelingError) as error:
        session.end_point(1_000, ONE)
    assert error.value.code is ErrorCode.POINT_NOT_STARTED
    session.start_point(2_000)
    with pytest.raises(LabelingError) as error:
        session.end_point(2_000, ONE)
    assert error.value.code is ErrorCode.POINT_TOO_SHORT
    session.cancel_point_start()
    assert session.pending_point_start is None


def test_overlap_is_rejected_but_touching_is_fine(session: LabelingSession) -> None:
    _mark(session, 1_000, 4_000)
    with pytest.raises(LabelingError) as error:
        session.start_point(2_000)
    assert error.value.code is ErrorCode.POINT_OVERLAP
    session.start_point(500)
    with pytest.raises(LabelingError) as error:
        session.end_point(1_500, ONE)
    assert error.value.code is ErrorCode.POINT_OVERLAP
    session.start_point(4_000)
    session.end_point(6_000, TWO)
    first, _ = session.points
    with pytest.raises(LabelingError) as error:
        session.edit_point(first.id, end_ms=5_000)
    assert error.value.code is ErrorCode.POINT_OVERLAP
    assert len(session.points) == 2


def test_edit_winner_reason_and_bounds(session: LabelingSession) -> None:
    _mark(session, 1_000, 4_000)
    point_id = session.points[0].id
    session.edit_point(point_id, winner=TWO, end_reason=PointEndReason.DOUBLE_BOUNCE)
    session.edit_point(point_id, start_ms=1_200)
    session.edit_point(point_id, end_ms=3_800)
    point = session.points[0]
    assert (point.winner, point.end_reason, point.start_ms, point.end_ms) == (
        TWO,
        PointEndReason.DOUBLE_BOUNCE,
        1_200,
        3_800,
    )
    with pytest.raises(LabelingError) as error:
        session.edit_point(point_id, end_ms=1_000)
    assert error.value.code is ErrorCode.POINT_TOO_SHORT


def test_delete_and_undo(session: LabelingSession) -> None:
    _mark(session, 1_000, 4_000)
    _mark(session, 5_000, 8_000, TWO)
    first = session.points[0].id
    session.edit_point(first, end_reason=PointEndReason.NET)
    session.remove_point(first)
    assert [p.number for p in session.points] == [1]
    assert session.points[0].winner is TWO
    assert session.selected is None
    session.undo()
    assert [p.end_reason for p in session.points] == [PointEndReason.NET, PointEndReason.OTHER]
    session.undo()
    assert [p.end_reason for p in session.points] == [PointEndReason.OTHER] * 2
    session.undo()
    session.undo()
    assert session.points == ()
    with pytest.raises(LabelingError):
        session.remove_point(first)


def test_same_edit_adds_no_undo_step(session: LabelingSession) -> None:
    _mark(session, 1_000, 4_000)
    session.edit_point(session.points[0].id, winner=ONE)
    session.undo()
    assert session.points == ()


def test_round_trip_keeps_points_and_correction_is_a_new_version(tmp_path: Path) -> None:
    labeler = new_uuid7()
    first = LabelingSession(new_uuid7())
    first.add_shot(1_500, track_id=0)
    _mark(first, 1_000, 4_000, TWO)
    first.edit_point(first.points[0].id, end_reason=PointEndReason.DIRECT_WALL)
    first.save(tmp_path, labeler, NOW)

    second = open_session(tmp_path, first.match_id, Camera.A)
    assert second.points == first.points
    _mark(second, 5_000, 7_000, ONE)
    second.save(tmp_path, labeler, NOW)

    v1 = read_label_set(tmp_path, first.match_id, 1)
    v2 = read_label_set(tmp_path, first.match_id)
    assert len(v1.points) == 1
    assert [(p.number, p.winner, p.end_reason) for p in v2.points] == [
        (1, TWO, PointEndReason.DIRECT_WALL),
        (2, ONE, PointEndReason.OTHER),
    ]
    assert len(v2.shots) == 1


# -- score --------------------------------------------------------------------------------


def _game(team: Team) -> list[Team]:
    return [team] * RULES.points_per_game


def _set(team: Team) -> list[Team]:
    return _game(team) * RULES.games_per_set


def test_game_calls_and_a_game() -> None:
    score = reconstruct_score([ONE, ONE, TWO], RULES, MatchFormat())
    assert score.calls == (GAME_CALLS[2], GAME_CALLS[1])
    score = reconstruct_score(_game(TWO), RULES, MatchFormat())
    assert (score.games, score.points) == ((0, 1), (0, 0))


def _deuce() -> list[Team]:
    forty = RULES.points_per_game - 1
    return [ONE, TWO] * forty


def test_deuce_with_advantage() -> None:
    fmt = MatchFormat(golden_point=False)
    deuce = reconstruct_score(_deuce(), RULES, fmt)
    assert deuce.deuce
    assert deuce.calls == (GAME_CALLS[-1], GAME_CALLS[-1])
    advantage = reconstruct_score([*_deuce(), TWO], RULES, fmt)
    assert advantage.calls == (GAME_CALLS[-1], ADVANTAGE_CALL)
    assert advantage.games == (0, 0)
    back = reconstruct_score([*_deuce(), TWO, ONE], RULES, fmt)
    assert back.deuce
    won = reconstruct_score([*_deuce(), TWO, ONE, ONE, ONE], RULES, fmt)
    assert won.games == (1, 0)


def test_golden_point_decides_at_deuce() -> None:
    fmt = MatchFormat(golden_point=True)
    assert reconstruct_score(_deuce(), RULES, fmt).deuce
    assert reconstruct_score([*_deuce(), TWO], RULES, fmt).games == (0, 1)


def test_set_needs_a_two_game_lead() -> None:
    almost = [*(_game(ONE) + _game(TWO)) * (RULES.games_per_set - 1), *_game(ONE)]
    score = reconstruct_score(almost, RULES, MatchFormat())
    assert score.sets == ()
    assert score.games == (RULES.games_per_set, RULES.games_per_set - 1)
    score = reconstruct_score([*almost, *_game(ONE)], RULES, MatchFormat())
    assert score.sets == ((RULES.games_per_set + 1, RULES.games_per_set - 1),)


def _to_tiebreak() -> list[Team]:
    return (_game(ONE) + _game(TWO)) * RULES.games_per_set


def test_tiebreak_to_seven_with_two_point_lead() -> None:
    fmt = MatchFormat()
    start = reconstruct_score(_to_tiebreak(), RULES, fmt)
    assert start.tiebreak
    assert start.calls is None
    level = [ONE, TWO] * (RULES.tiebreak_points - 1)
    tied = reconstruct_score([*_to_tiebreak(), *level], RULES, fmt)
    assert tied.points == (RULES.tiebreak_points - 1,) * 2
    one_up = reconstruct_score([*_to_tiebreak(), *level, TWO], RULES, fmt)
    assert one_up.tiebreak
    assert one_up.sets == ()
    won = reconstruct_score([*_to_tiebreak(), *level, TWO, TWO], RULES, fmt)
    per_set = RULES.games_per_set
    assert won.sets == ((per_set, per_set + 1),)
    assert not won.tiebreak


def test_match_and_points_after_the_end() -> None:
    score = reconstruct_score([*_set(ONE), *_set(ONE), ONE], RULES, MatchFormat())
    assert score.winner is ONE
    assert score.sets_won == (RULES.sets_to_win, 0)
    assert score.points_after_end == 1


def test_super_tiebreak_decides_the_third_set() -> None:
    fmt = MatchFormat(super_tiebreak=True)
    one_all = [*_set(ONE), *_set(TWO)]
    start = reconstruct_score(one_all, RULES, fmt)
    assert start.super_tiebreak
    assert start.tiebreak
    won = reconstruct_score([*one_all, *[TWO] * RULES.super_tiebreak_points], RULES, fmt)
    assert won.winner is TWO
    assert won.sets[-1] == (0, 1)
    regular = reconstruct_score(one_all, RULES, MatchFormat())
    assert not regular.tiebreak


def test_rules_come_from_the_config() -> None:
    short = ScoringRules(
        points_per_game=RULES.points_per_game,
        min_point_lead=RULES.min_point_lead,
        sets_to_win=1,
        games_per_set=1,
        min_game_lead=1,
        tiebreak_points=RULES.tiebreak_points,
        super_tiebreak_points=RULES.super_tiebreak_points,
    )
    assert reconstruct_score(_game(TWO), short, MatchFormat()).winner is TWO


# -- actions, config, locale and server ---------------------------------------------------


def _press(session: LabelingSession, tmp_path: Path, **fields: object) -> None:
    request = ActionRequest.model_validate({"mode": Mode.POINTS, **fields})
    apply_action(session, request, 20, SaveTarget(tmp_path, new_uuid7()))


def test_shortcuts_mark_edit_and_delete_points(session: LabelingSession, tmp_path: Path) -> None:
    _press(session, tmp_path, action="point_start", time_ms=1_000)
    _press(session, tmp_path, action="point_end", time_ms=3_000, winner="2")
    _press(session, tmp_path, action="point_reason", time_ms=3_000, end_reason="net")
    _press(session, tmp_path, action="point_end", time_ms=3_000, winner="1")
    _press(session, tmp_path, action="point_set_start", time_ms=1_100)
    _press(session, tmp_path, action="point_set_end", time_ms=3_100)
    point = session.points[0]
    assert (point.winner, point.end_reason, point.start_ms, point.end_ms) == (
        ONE,
        PointEndReason.NET,
        1_100,
        3_100,
    )
    state = session_state(session, scoring=RULES)
    assert state["points"][0]["score_after"]["calls"] == [GAME_CALLS[1], GAME_CALLS[0]]
    assert state["score"]["games"] == [0, 0]
    _press(session, tmp_path, action="delete_selected", time_ms=0)
    assert list(session.points) == []
    _press(session, tmp_path, action="undo", time_ms=0)
    assert len(session.points) == 1
    with pytest.raises(ValueError, match="winner"):
        _press(session, tmp_path, action="point_end", time_ms=0)


def test_default_config_and_locale_cover_points_mode() -> None:
    config = load_labeling_config()
    assert {s.end_reason for s in config.points.shortcuts if s.end_reason} == set(PointEndReason)
    texts = json.loads(LOCALE_PATH.read_text(encoding="utf-8"))
    assert set(texts["end_reasons"]) == {r.value for r in PointEndReason}
    assert set(texts["teams"]) == {t.value for t in Team}
    assert set(texts["score"]["calls"]) == {*GAME_CALLS, ADVANTAGE_CALL}
    assert all(len(s.key) == 1 or s.key in texts["key_names"] for s in config.points.shortcuts)


def test_config_rejects_bad_point_shortcuts() -> None:
    raw = load_labeling_config().model_dump(mode="json")
    section = raw["points"]["shortcuts"]
    clash = [*section, {"key": "z", "action": "point_start"}]
    with pytest.raises(ValidationError, match="clash"):
        LabelingConfig.model_validate({**raw, "points": {"shortcuts": clash}})
    no_reason = [s for s in section if s.get("end_reason") != "net"]
    with pytest.raises(ValidationError, match="missing"):
        LabelingConfig.model_validate({**raw, "points": {"shortcuts": no_reason}})
    misplaced = [*raw["shortcuts"], {"key": "?", "action": Action.POINT_START.value}]
    with pytest.raises(ValidationError):
        LabelingConfig.model_validate({**raw, "shortcuts": misplaced})


@pytest.fixture
def running_app(tmp_path: Path) -> Iterator[tuple[str, LabelingSession]]:
    video = tmp_path / "clip.mp4"
    video.write_bytes(b"video")
    session = LabelingSession(new_uuid7())
    app = App(session, load_labeling_config(), video, SaveTarget(tmp_path, new_uuid7()), Lock())
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(app))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}", session
    finally:
        server.shutdown()
        server.server_close()


def _post(base: str, body: dict[str, object], origin: str) -> tuple[int, dict[str, object]]:
    request = urllib.request.Request(  # noqa: S310
        f"{base}/api/action",
        data=json.dumps(body).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "Origin": origin},
    )
    try:
        with urllib.request.urlopen(request) as response:  # noqa: S310
            return int(response.status), dict(json.load(response))
    except urllib.error.HTTPError as error:
        return error.code, dict(json.load(error))


def test_server_points_actions_and_cross_origin(
    running_app: tuple[str, LabelingSession],
) -> None:
    base, session = running_app
    start = {"action": "point_start", "time_ms": 1_000, "mode": "points"}
    assert _post(base, start, "http://evil.example")[0] == 403
    assert session.pending_point_start is None
    assert _post(base, start, base)[0] == 200
    status, state = _post(
        base, {"action": "point_end", "time_ms": 2_000, "winner": "1", "mode": "points"}, base
    )
    assert status == 200
    assert isinstance(state["points"], list)
    assert len(state["points"]) == 1
    assert isinstance(state["score"], dict)
    status, state = _post(base, {**start, "time_ms": 1_500}, base)
    assert (status, state["error"]) == (409, ErrorCode.POINT_OVERLAP.value)
