"""Labeling tool: session state machine, shortcut actions, config and a full round trip."""

from __future__ import annotations

import json
import threading
import urllib.request
from collections.abc import Iterator
from datetime import UTC, datetime
from http.server import ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from uuid import UUID

import pytest
from pydantic import ValidationError

from ml.labeling.__main__ import local_labeler_id, match_id_for_video
from ml.labeling.actions import PLAYBACK_ACTIONS, ActionRequest, SaveTarget, apply_action
from ml.labeling.config import Action, LabelingConfig, load_labeling_config
from ml.labeling.server import LOCALE_PATH, App, make_handler
from ml.labeling.session import ErrorCode, LabelingError, LabelingSession, new_uuid7, open_session
from ml.labels import (
    LabelSetInfo,
    MatchLabels,
    ShotTypeLabel,
    list_label_set_versions,
    read_label_set,
    write_label_set,
)
from ml.schemas import Camera, CourtSide, ShotType, Surface

NUDGE_MS = 20
NOW = datetime(2026, 10, 17, 12, tzinfo=UTC)


@pytest.fixture
def session() -> LabelingSession:
    return LabelingSession(new_uuid7())


def test_uuid7_ids() -> None:
    assert new_uuid7().version == 7


def test_add_events_in_time_order(session: LabelingSession) -> None:
    late = session.add_shot(2_000, track_id=1)
    early = session.add_bounce(1_000, Surface.BACK_GLASS)
    assert [e.id for e in session.events()] == [early, late]
    assert session.bounces[0].side is CourtSide.A
    assert session.shots[0].camera is Camera.A
    assert session.selected == early
    assert session.dirty


def test_toggle_side_applies_to_next_bounces(session: LabelingSession) -> None:
    assert session.toggle_side() is CourtSide.B
    session.add_bounce(500, Surface.FLOOR)
    assert session.bounces[0].side is CourtSide.B


def _shot_times(session: LabelingSession) -> list[int]:
    return [shot.time_ms for shot in session.shots]


def test_remove_move_nudge_and_undo(session: LabelingSession) -> None:
    shot = session.add_shot(1_000, track_id=0)
    session.move(shot, 1_500)
    assert _shot_times(session) == [1_500]
    session.nudge(shot, -NUDGE_MS)
    assert _shot_times(session) == [1_500 - NUDGE_MS]
    session.remove(shot)
    assert _shot_times(session) == []
    assert session.selected is None
    session.undo()
    assert _shot_times(session) == [1_500 - NUDGE_MS]
    session.undo()
    session.undo()
    assert _shot_times(session) == [1_000]
    session.undo()
    assert _shot_times(session) == []
    assert not session.dirty
    with pytest.raises(LabelingError) as error:
        session.undo()
    assert error.value.code is ErrorCode.NOTHING_TO_UNDO


def test_rejects_times_outside_the_video(session: LabelingSession) -> None:
    session.set_duration(10_000)
    with pytest.raises(LabelingError) as error:
        session.add_shot(10_001, track_id=0)
    assert error.value.code is ErrorCode.TIME_AFTER_END
    shot = session.add_shot(100, track_id=0)
    with pytest.raises(LabelingError) as error:
        session.nudge(shot, -1_000)
    assert error.value.code is ErrorCode.TIME_NEGATIVE
    assert session.shots[0].time_ms == 100
    with pytest.raises(LabelingError) as error:
        session.remove(new_uuid7())
    assert error.value.code is ErrorCode.EVENT_NOT_FOUND


def test_selection_steps(session: LabelingSession) -> None:
    assert session.select_step(1, 0) is None
    a = session.add_shot(1_000, track_id=0)
    b = session.add_bounce(2_000, Surface.FLOOR)
    c = session.add_shot(3_000, track_id=1)
    session.selected = None
    assert session.select_step(1, 2_100) == b
    assert session.select_step(1, 0) == c
    assert session.select_step(1, 0) == c
    assert session.select_step(-1, 0) == b
    assert session.select_step(-1, 0) == a
    assert session.select_step(-1, 0) == a


def test_save_needs_changes(session: LabelingSession, tmp_path: Path) -> None:
    with pytest.raises(LabelingError) as error:
        session.save(tmp_path, new_uuid7())
    assert error.value.code is ErrorCode.NOTHING_TO_SAVE


def test_base_must_be_the_same_match() -> None:
    base = MatchLabels(
        info=LabelSetInfo(match_id=new_uuid7(), version=1, labeler=new_uuid7(), labeled_at=NOW)
    )
    with pytest.raises(ValueError, match="base label set"):
        LabelingSession(new_uuid7(), base=base)


def test_correction_keeps_shot_types_of_remaining_shots(tmp_path: Path) -> None:
    session = LabelingSession(new_uuid7())
    kept = session.add_shot(1_000, track_id=0)
    dropped = session.add_shot(2_000, track_id=1)
    labeler = new_uuid7()
    labels = session.build(labeler, 1, NOW).model_copy(
        update={
            "shot_types": (
                ShotTypeLabel(shot_id=kept, shot_type=ShotType.SERVE),
                ShotTypeLabel(shot_id=dropped, shot_type=ShotType.LOB),
            )
        }
    )
    write_label_set(tmp_path, labels)

    reopened = open_session(tmp_path, session.match_id, Camera.A)
    reopened.remove(dropped)
    reopened.save(tmp_path, labeler, NOW)
    corrected = read_label_set(tmp_path, session.match_id)
    assert corrected.info.version == 2
    assert [t.shot_id for t in corrected.shot_types] == [kept]
    assert read_label_set(tmp_path, session.match_id, 1) == labels


def _press(
    session: LabelingSession, target: SaveTarget, action: Action, time_ms: int, **extra: object
) -> Path | None:
    request = ActionRequest.model_validate({"action": action, "time_ms": time_ms, **extra})
    return apply_action(session, request, NUDGE_MS, target)


def test_full_round_trip_with_shortcut_actions(tmp_path: Path) -> None:
    """Label a synthetic rally with shortcuts on a single-camera video, save and read back."""
    match_id = match_id_for_video(tmp_path, Path("partido-existente.mp4"))
    assert match_id_for_video(tmp_path, Path("partido-existente.mp4")) == match_id
    labeler = local_labeler_id(tmp_path / "labeler_id")
    assert local_labeler_id(tmp_path / "labeler_id") == labeler
    target = SaveTarget(tmp_path, labeler)
    session = open_session(tmp_path, match_id, Camera.A)
    session.set_duration(60_000)

    _press(session, target, Action.SHOT, 1_000, track_id=0)
    _press(session, target, Action.BOUNCE, 1_600, surface="floor")
    _press(session, target, Action.SHOT, 2_200, track_id=2)
    _press(session, target, Action.NUDGE_FORWARD, 2_200)
    _press(session, target, Action.TOGGLE_SIDE, 2_300)
    _press(session, target, Action.BOUNCE, 2_900, surface="back_glass")
    _press(session, target, Action.BOUNCE, 3_100, surface="net")
    _press(session, target, Action.DELETE_SELECTED, 3_100)
    _press(session, target, Action.SHOT, 3_500, track_id=1)
    _press(session, target, Action.UNDO, 3_500)
    _press(session, target, Action.SELECT_PREV, 3_500)
    _press(session, target, Action.MOVE_TO_PLAYHEAD, 1_650)
    saved = _press(session, target, Action.SAVE, 4_000)

    assert saved is not None
    assert not session.dirty
    labels = read_label_set(tmp_path, match_id)
    assert labels.info.labeler == labeler
    assert labels.info.version == 1
    assert [(s.time_ms, s.track_id) for s in labels.shots] == [(1_000, 0), (2_200 + NUDGE_MS, 2)]
    assert [(b.time_ms, b.surface, b.side) for b in labels.bounces] == [
        (1_600, Surface.FLOOR, CourtSide.A),
        (1_650, Surface.BACK_GLASS, CourtSide.B),
    ]
    assert {s.camera for s in labels.shots} | {b.camera for b in labels.bounces} == {Camera.A}
    MatchLabels.model_validate(labels.model_dump())

    _press(session, target, Action.SHOT, 5_000, track_id=3)
    _press(session, target, Action.SAVE, 5_000)
    assert list_label_set_versions(tmp_path, match_id) == [1, 2]


def test_shortcut_without_selection_does_nothing(session: LabelingSession, tmp_path: Path) -> None:
    target = SaveTarget(tmp_path, new_uuid7())
    for action in (Action.DELETE_SELECTED, Action.NUDGE_BACK, Action.MOVE_TO_PLAYHEAD):
        assert _press(session, target, action, 0) is None
    assert not session.can_undo


@pytest.mark.parametrize("action", sorted(PLAYBACK_ACTIONS))
def test_playback_actions_are_rejected(
    session: LabelingSession, tmp_path: Path, action: Action
) -> None:
    with pytest.raises(ValueError, match="browser"):
        _press(session, SaveTarget(tmp_path, new_uuid7()), action, 0)


def test_shot_and_bounce_need_their_argument(session: LabelingSession, tmp_path: Path) -> None:
    target = SaveTarget(tmp_path, new_uuid7())
    with pytest.raises(ValueError, match="track_id"):
        _press(session, target, Action.SHOT, 0)
    with pytest.raises(ValueError, match="surface"):
        _press(session, target, Action.BOUNCE, 0)


def test_default_config_covers_every_action_and_surface() -> None:
    config = load_labeling_config()
    assert {s.action for s in config.shortcuts} == set(Action)
    assert {s.surface for s in config.shortcuts if s.surface} == set(Surface)


def test_config_rejects_bad_shortcuts() -> None:
    raw = load_labeling_config().model_dump(mode="json")
    duplicated = {**raw, "shortcuts": [*raw["shortcuts"], raw["shortcuts"][0]]}
    with pytest.raises(ValidationError, match="unique"):
        LabelingConfig.model_validate(duplicated)
    with pytest.raises(ValidationError, match="track_id"):
        LabelingConfig.model_validate({**raw, "shortcuts": [{"key": "x", "action": "shot"}]})


def test_locale_has_every_text_the_page_needs() -> None:
    texts = json.loads(LOCALE_PATH.read_text(encoding="utf-8"))
    assert set(texts["actions"]) == {a.value for a in Action}
    assert set(texts["surfaces"]) == {s.value for s in Surface}
    assert {c.value for c in ErrorCode} <= set(texts["errors"])
    keys = {s.key for s in load_labeling_config().shortcuts}
    assert all(len(k) == 1 or k in texts["key_names"] for k in keys)


def test_server_serves_video_ranges_and_actions(tmp_path: Path) -> None:
    video = tmp_path / "clip.mp4"
    video.write_bytes(bytes(range(256)))
    config = load_labeling_config()
    session = LabelingSession(new_uuid7())
    app = App(session, config, video, SaveTarget(tmp_path, new_uuid7()), Lock())
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(app))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        request = urllib.request.Request(  # noqa: S310
            f"{base}/video", headers={"Range": "bytes=10-19"}
        )
        with urllib.request.urlopen(request) as response:  # noqa: S310
            assert response.status == 206
            assert response.read() == bytes(range(10, 20))

        def post(path: str, body: dict[str, object]) -> dict[str, object]:
            req = urllib.request.Request(  # noqa: S310
                f"{base}{path}",
                data=json.dumps(body).encode(),
                method="POST",
                headers={"Content-Type": "application/json", "Origin": base},
            )
            try:
                with urllib.request.urlopen(req) as response:  # noqa: S310
                    return dict(json.load(response))
            except urllib.error.HTTPError as error:
                return dict(json.load(error))

        post("/api/duration", {"duration_ms": 5_000})
        state = post("/api/action", {"action": "shot", "time_ms": 1_000, "track_id": 0})
        assert isinstance(state["events"], list)
        assert len(state["events"]) == 1
        assert post("/api/action", {"action": "shot", "time_ms": 9_000, "track_id": 0})[
            "error"
        ] == (ErrorCode.TIME_AFTER_END.value)
        saved = post("/api/action", {"action": "save", "time_ms": 1_000})
        assert saved["version"] == 1
        assert UUID(str(saved["match_id"])) == session.match_id
        with urllib.request.urlopen(f"{base}/api/config") as response:  # noqa: S310
            assert "texts" in json.load(response)
    finally:
        server.shutdown()
        server.server_close()


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


def _status(url: str, data: bytes | None, headers: dict[str, str]) -> int:
    request = urllib.request.Request(  # noqa: S310
        url, data=data, headers=headers, method="POST" if data is not None else "GET"
    )
    try:
        with urllib.request.urlopen(request) as response:  # noqa: S310
            return int(response.status)
    except urllib.error.HTTPError as error:
        return error.code


SAVE_BODY = json.dumps({"action": "shot", "time_ms": 0, "track_id": 0}).encode()


def test_server_accepts_same_origin_json(running_app: tuple[str, LabelingSession]) -> None:
    base, session = running_app
    headers = {"Content-Type": "application/json", "Origin": base}
    assert _status(f"{base}/api/action", SAVE_BODY, headers) == 200
    assert len(session.shots) == 1


def test_server_rejects_cross_origin_post(running_app: tuple[str, LabelingSession]) -> None:
    base, session = running_app
    headers = {"Content-Type": "application/json", "Origin": "http://evil.example"}
    assert _status(f"{base}/api/action", SAVE_BODY, headers) == 403
    assert session.shots == ()


def test_server_rejects_text_plain_post(running_app: tuple[str, LabelingSession]) -> None:
    base, session = running_app
    assert _status(f"{base}/api/action", SAVE_BODY, {"Content-Type": "text/plain"}) == 403
    assert session.shots == ()


def test_server_rejects_spoofed_host(running_app: tuple[str, LabelingSession]) -> None:
    base, session = running_app
    assert _status(f"{base}/api/state", None, {"Host": "evil.example"}) == 403
    headers = {"Content-Type": "application/json", "Host": "evil.example:80"}
    assert _status(f"{base}/api/action", SAVE_BODY, headers) == 403
    assert session.shots == ()


def test_server_rejects_oversized_body(running_app: tuple[str, LabelingSession]) -> None:
    base, _session = running_app
    limit = load_labeling_config().server.max_body_bytes
    body = json.dumps({"action": "undo", "time_ms": 0, "pad": "x" * limit}).encode()
    assert _status(f"{base}/api/action", body, {"Content-Type": "application/json"}) == 400


@pytest.mark.parametrize("host", ["0.0.0.0", "192.168.0.10", "::", "example.com"])  # noqa: S104
def test_config_only_listens_on_loopback(host: str) -> None:
    raw = load_labeling_config().model_dump(mode="json")
    with pytest.raises(ValidationError, match="host"):
        LabelingConfig.model_validate({**raw, "server": {**raw["server"], "host": host}})
