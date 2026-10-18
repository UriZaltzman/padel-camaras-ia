"""Command line entry point: ``uv run python -m ml.labeling <video> --labels-root <dir>``."""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from threading import Lock
from uuid import UUID

from ml.labeling.actions import SaveTarget
from ml.labeling.config import DEFAULT_LABELING_CONFIG_PATH, load_labeling_config
from ml.labeling.server import LOCALE_PATH, App, serve
from ml.labeling.session import new_uuid7, open_session
from ml.schemas import Camera

VIDEO_INDEX_NAME = "videos.json"
"""Inside the labels root: maps each video file name to the match id it was given."""
LABELER_ID_PATH = Path.home() / ".config" / "ml-labeling" / "labeler_id"
"""This computer's labeler id, created once. An opaque UUID v7, never personal data."""


def match_id_for_video(labels_root: Path, video: Path) -> UUID:
    """Match id of a video, assigned on first use so existing videos can be labeled too."""
    index_path = labels_root / VIDEO_INDEX_NAME
    index: dict[str, str] = (
        json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}
    )
    if video.name not in index:
        index[video.name] = str(new_uuid7())
        labels_root.mkdir(parents=True, exist_ok=True)
        index_path.write_text(json.dumps(index, sort_keys=True), encoding="utf-8")
    return UUID(index[video.name])


def local_labeler_id(path: Path = LABELER_ID_PATH) -> UUID:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(str(new_uuid7()), encoding="utf-8")
    return UUID(path.read_text(encoding="utf-8").strip())


def main(argv: list[str] | None = None) -> None:
    texts = json.loads(LOCALE_PATH.read_text(encoding="utf-8"))["cli"]
    parser = argparse.ArgumentParser(prog="python -m ml.labeling", description=texts["description"])
    parser.add_argument("video", type=Path, help=texts["video"])
    parser.add_argument("--labels-root", type=Path, required=True, help=texts["labels_root"])
    parser.add_argument("--match-id", type=UUID, help=texts["match_id"])
    parser.add_argument("--camera", type=Camera, default=Camera.A, help=texts["camera"])
    parser.add_argument("--labeler", type=UUID, help=texts["labeler"])
    parser.add_argument("--config", type=Path, default=DEFAULT_LABELING_CONFIG_PATH)
    args = parser.parse_args(argv)
    if not args.video.is_file():
        parser.error(texts["video_missing"].format(video=args.video))

    logging.basicConfig(level=logging.INFO)
    config = load_labeling_config(args.config)
    match_id = args.match_id or match_id_for_video(args.labels_root, args.video)
    labeler = args.labeler or local_labeler_id()
    session = open_session(args.labels_root, match_id, args.camera)
    app = App(
        session=session,
        config=config,
        video_path=args.video,
        target=SaveTarget(args.labels_root, labeler),
        lock=Lock(),
    )
    url = f"http://{config.server.host}:{config.server.port}/"
    print(texts["ready"].format(url=url, match_id=match_id))  # noqa: T201
    try:
        serve(app)
    except KeyboardInterrupt:
        if session.dirty:
            print(texts["unsaved"])  # noqa: T201


if __name__ == "__main__":
    main()
