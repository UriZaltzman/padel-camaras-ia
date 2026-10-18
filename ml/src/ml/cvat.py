"""Converters from CVAT exports to typed frame annotations (spec section 8).

Player boxes and ball points are labeled in CVAT (see ``ml/docs/cvat.md``). This module
reads two export formats and returns validated records that ``ml.parquet_io`` stores:

- *CVAT for video 1.1* (XML): ``person`` tracks of boxes and ``ball`` tracks of points.
  CVAT writes one element per frame, keyframes and interpolated frames alike, and marks the
  frames where the object left the view with ``outside="1"``; those are skipped.
- *COCO 1.0* (JSON): ``person`` boxes only. COCO has no points, so balls need the XML export.

Coordinates are in pixels of the original video, origin at the top-left corner. Every box or
point must lie inside the frame; anything malformed raises ``CvatFormatError`` instead of
being dropped silently, so a conversion either keeps every label or fails.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from collections.abc import Iterable
from pathlib import Path
from typing import Annotated, Any, Self
from xml.etree.ElementTree import Element

from defusedxml import DTDForbidden, ElementTree
from pydantic import Field, ValidationError, model_validator

from ml.parquet_io import write_records
from ml.schemas import Camera, NonNegativeInt, StageRecord

PERSON_LABEL = "person"
BALL_LABEL = "ball"
SUPPORTED_CVAT_VERSION = "1.1"
TRUE_FLAG = "1"
FALSE_FLAG = "0"
FRAME_NUMBER_PATTERN = re.compile(r"(\d+)(?=\.[^.]+$)")
"""CVAT names exported frames ``frame_000123.PNG``: the frame is the last run of digits."""

COCO_BBOX_FIELDS = ("x", "y", "width", "height")

PositiveInt = Annotated[int, Field(ge=1)]
Pixel = Annotated[float, Field(ge=0.0)]


class CvatFormatError(ValueError):
    """The export is malformed or holds labels the converter cannot keep without loss."""


class FrameSize(StageRecord):
    width_px: PositiveInt
    height_px: PositiveInt


class PlayerBoxLabel(StageRecord):
    """A person box in one frame. ``track_id`` is the CVAT track (``None`` for COCO)."""

    camera: Camera
    frame: NonNegativeInt
    track_id: NonNegativeInt | None
    x_min_px: Pixel
    y_min_px: Pixel
    x_max_px: Pixel
    y_max_px: Pixel
    occluded: bool = False

    @model_validator(mode="after")
    def _has_area(self) -> Self:
        if self.x_max_px <= self.x_min_px or self.y_max_px <= self.y_min_px:
            msg = f"box in frame {self.frame} has no area"
            raise ValueError(msg)
        return self


class BallPointLabel(StageRecord):
    """The ball centre in one frame."""

    camera: Camera
    frame: NonNegativeInt
    x_px: Pixel
    y_px: Pixel
    occluded: bool = False


class FrameAnnotations(StageRecord):
    """Everything converted from one export: one camera of one video."""

    camera: Camera
    size: FrameSize
    players: tuple[PlayerBoxLabel, ...] = ()
    balls: tuple[BallPointLabel, ...] = ()

    @model_validator(mode="after")
    def _is_consistent(self) -> Self:
        width, height = self.size.width_px, self.size.height_px
        for box in self.players:
            if box.camera != self.camera:
                msg = f"box in frame {box.frame} is from camera {box.camera}"
                raise ValueError(msg)
            if box.x_max_px > width or box.y_max_px > height:
                msg = f"box in frame {box.frame} goes outside the {width}x{height} frame"
                raise ValueError(msg)
        for ball in self.balls:
            if ball.camera != self.camera:
                msg = f"ball in frame {ball.frame} is from camera {ball.camera}"
                raise ValueError(msg)
            if ball.x_px > width or ball.y_px > height:
                msg = f"ball in frame {ball.frame} is outside the {width}x{height} frame"
                raise ValueError(msg)
        repeated = [f for f, n in Counter(b.frame for b in self.balls).items() if n > 1]
        if repeated:
            msg = f"only one ball per frame, repeated frames: {sorted(repeated)}"
            raise ValueError(msg)
        tracked = Counter((b.track_id, b.frame) for b in self.players if b.track_id is not None)
        if repeated_tracks := [key for key, n in tracked.items() if n > 1]:
            msg = f"a track can have only one box per frame, repeated: {repeated_tracks}"
            raise ValueError(msg)
        return self


def _build(
    camera: Camera,
    size: FrameSize,
    players: Iterable[PlayerBoxLabel],
    balls: Iterable[BallPointLabel],
) -> FrameAnnotations:
    try:
        return FrameAnnotations(
            camera=camera,
            size=size,
            players=tuple(sorted(players, key=lambda b: (b.frame, b.track_id or 0))),
            balls=tuple(sorted(balls, key=lambda b: b.frame)),
        )
    except ValidationError as error:
        raise CvatFormatError(str(error)) from error


# --- CVAT for video 1.1 ------------------------------------------------------------------


def _attr(element: Element, name: str) -> str:
    value = element.get(name)
    if value is None:
        msg = f"<{element.tag}> is missing the {name!r} attribute"
        raise CvatFormatError(msg)
    return value


def _flag(element: Element, name: str) -> bool:
    value = element.get(name, FALSE_FLAG)
    if value not in {TRUE_FLAG, FALSE_FLAG}:
        msg = f"<{element.tag}> has {name}={value!r}, expected 0 or 1"
        raise CvatFormatError(msg)
    return value == TRUE_FLAG


def _number(text: str | None, what: str) -> float:
    try:
        return float(text or "")
    except ValueError as error:
        msg = f"{what} is not a number: {text!r}"
        raise CvatFormatError(msg) from error


def _integer(text: str | None, what: str) -> int:
    if text is None or not text.strip().isdigit():
        msg = f"{what} is not a non-negative integer: {text!r}"
        raise CvatFormatError(msg)
    return int(text)


def _xml_frame_size(root: Element) -> FrameSize:
    original = root.find("meta/task/original_size")
    if original is None:
        original = root.find("meta/job/original_size")
    if original is None:
        msg = "export has no meta/task/original_size: is it a CVAT for video export?"
        raise CvatFormatError(msg)
    try:
        return FrameSize(
            width_px=_integer(original.findtext("width"), "original_size/width"),
            height_px=_integer(original.findtext("height"), "original_size/height"),
        )
    except ValidationError as error:
        raise CvatFormatError(str(error)) from error


def _xml_box(box: Element, camera: Camera, track_id: int) -> PlayerBoxLabel:
    frame = _integer(box.get("frame"), "box frame")
    try:
        return PlayerBoxLabel(
            camera=camera,
            frame=frame,
            track_id=track_id,
            x_min_px=_number(_attr(box, "xtl"), "xtl"),
            y_min_px=_number(_attr(box, "ytl"), "ytl"),
            x_max_px=_number(_attr(box, "xbr"), "xbr"),
            y_max_px=_number(_attr(box, "ybr"), "ybr"),
            occluded=_flag(box, "occluded"),
        )
    except ValidationError as error:
        raise CvatFormatError(f"track {track_id}, frame {frame}: {error}") from error


def _xml_point(points: Element, camera: Camera) -> BallPointLabel:
    frame = _integer(points.get("frame"), "points frame")
    coordinates = _attr(points, "points").split(";")
    if len(coordinates) != 1:
        msg = f"frame {frame}: a ball is one point, got {len(coordinates)}"
        raise CvatFormatError(msg)
    x_text, _, y_text = coordinates[0].partition(",")
    try:
        return BallPointLabel(
            camera=camera,
            frame=frame,
            x_px=_number(x_text, "ball x"),
            y_px=_number(y_text, "ball y"),
            occluded=_flag(points, "occluded"),
        )
    except ValidationError as error:
        raise CvatFormatError(f"ball, frame {frame}: {error}") from error


def parse_cvat_video_xml(text: str, camera: Camera) -> FrameAnnotations:
    """Convert a *CVAT for video 1.1* export (the ``annotations.xml`` file)."""
    try:
        root = ElementTree.fromstring(text, forbid_dtd=True)
    except ElementTree.ParseError as error:
        msg = f"not valid XML: {error}"
        raise CvatFormatError(msg) from error
    except DTDForbidden as error:
        msg = "XML with entities or a DTD is refused: CVAT exports never have one"
        raise CvatFormatError(msg) from error
    if root.tag != "annotations":
        msg = f"root element is <{root.tag}>, expected <annotations>"
        raise CvatFormatError(msg)
    version = (root.findtext("version") or "").strip()
    if version != SUPPORTED_CVAT_VERSION:
        msg = f"CVAT format version {version!r}, this converter reads {SUPPORTED_CVAT_VERSION}"
        raise CvatFormatError(msg)
    if root.find("image") is not None:
        msg = "export uses the 'CVAT for images' layout; export as 'CVAT for video 1.1'"
        raise CvatFormatError(msg)

    size = _xml_frame_size(root)
    players: list[PlayerBoxLabel] = []
    balls: list[BallPointLabel] = []
    for track in root.iter("track"):
        track_id = _integer(track.get("id"), "track id")
        label = _attr(track, "label")
        shapes = [child for child in track if child.tag != "attribute"]
        expected = {PERSON_LABEL: "box", BALL_LABEL: "points"}.get(label)
        if expected is None:
            msg = f"track {track_id} has unknown label {label!r}"
            raise CvatFormatError(msg)
        for shape in shapes:
            if shape.tag != expected:
                msg = f"track {track_id} ({label}) holds <{shape.tag}>, expected <{expected}>"
                raise CvatFormatError(msg)
            if _flag(shape, "outside"):
                continue
            if label == PERSON_LABEL:
                players.append(_xml_box(shape, camera, track_id))
            else:
                balls.append(_xml_point(shape, camera))
    return _build(camera, size, players, balls)


def read_cvat_video_xml(path: Path, camera: Camera) -> FrameAnnotations:
    return parse_cvat_video_xml(path.read_text(encoding="utf-8"), camera)


# --- COCO 1.0 ----------------------------------------------------------------------------


def _object(value: object, what: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        msg = f"{what} must be a JSON object"
        raise CvatFormatError(msg)
    return value


def _list(value: object, what: str) -> list[Any]:
    if not isinstance(value, list):
        msg = f"{what} must be a JSON list"
        raise CvatFormatError(msg)
    return value


def _json_int(value: object, what: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        msg = f"{what} must be an integer, got {value!r}"
        raise CvatFormatError(msg)
    return value


def _frame_from_file_name(file_name: object) -> int:
    match = FRAME_NUMBER_PATTERN.search(file_name) if isinstance(file_name, str) else None
    if match is None:
        msg = f"cannot read the frame number from image file_name {file_name!r}"
        raise CvatFormatError(msg)
    return int(match.group(1))


def parse_coco(text: str, camera: Camera) -> FrameAnnotations:
    """Convert a *COCO 1.0* export of person boxes. Every image must share one size."""
    try:
        document = _object(json.loads(text), "COCO document")
    except json.JSONDecodeError as error:
        msg = f"not valid JSON: {error}"
        raise CvatFormatError(msg) from error

    categories = {
        _json_int(c.get("id"), "category id"): c.get("name")
        for c in (_object(c, "category") for c in _list(document.get("categories"), "categories"))
    }
    frames: dict[int, int] = {}
    sizes: set[tuple[int, int]] = set()
    for raw in _list(document.get("images"), "images"):
        image = _object(raw, "image")
        image_id = _json_int(image.get("id"), "image id")
        frames[image_id] = _frame_from_file_name(image.get("file_name"))
        sizes.add((_json_int(image.get("width"), "width"), _json_int(image.get("height"), "h")))
    if len(sizes) != 1:
        msg = f"expected every image to share one size, got {sorted(sizes)}"
        raise CvatFormatError(msg)
    ((width, height),) = sizes
    try:
        size = FrameSize(width_px=width, height_px=height)
    except ValidationError as error:
        raise CvatFormatError(str(error)) from error

    players: list[PlayerBoxLabel] = []
    for raw in _list(document.get("annotations"), "annotations"):
        annotation = _object(raw, "annotation")
        category = categories.get(_json_int(annotation.get("category_id"), "category_id"))
        if category != PERSON_LABEL:
            msg = f"annotation with category {category!r}; COCO carries only person boxes"
            raise CvatFormatError(msg)
        image_id = _json_int(annotation.get("image_id"), "image_id")
        if image_id not in frames:
            msg = f"annotation refers to unknown image {image_id}"
            raise CvatFormatError(msg)
        bbox = _list(annotation.get("bbox"), "bbox")
        if len(bbox) != len(COCO_BBOX_FIELDS) or not all(
            isinstance(v, int | float) and not isinstance(v, bool) for v in bbox
        ):
            msg = f"bbox must be 4 numbers [x, y, width, height], got {bbox!r}"
            raise CvatFormatError(msg)
        x, y, w, h = (float(v) for v in bbox)
        attributes = annotation.get("attributes")
        occluded = isinstance(attributes, dict) and attributes.get("occluded") is True
        try:
            players.append(
                PlayerBoxLabel(
                    camera=camera,
                    frame=frames[image_id],
                    track_id=None,
                    x_min_px=x,
                    y_min_px=y,
                    x_max_px=x + w,
                    y_max_px=y + h,
                    occluded=occluded,
                )
            )
        except ValidationError as error:
            raise CvatFormatError(f"image {image_id}: {error}") from error
    return _build(camera, size, players, ())


def read_coco(path: Path, camera: Camera) -> FrameAnnotations:
    return parse_coco(path.read_text(encoding="utf-8"), camera)


# --- Parquet -----------------------------------------------------------------------------

PLAYER_BOXES_FILE = "player_boxes.parquet"
BALL_POINTS_FILE = "ball_points.parquet"


def write_frame_annotations(annotations: FrameAnnotations, out_dir: Path) -> tuple[Path, Path]:
    """Store the boxes and points as two Parquet files and return their paths."""
    boxes_path = out_dir / PLAYER_BOXES_FILE
    balls_path = out_dir / BALL_POINTS_FILE
    write_records(list(annotations.players), PlayerBoxLabel, boxes_path)
    write_records(list(annotations.balls), BallPointLabel, balls_path)
    return boxes_path, balls_path
