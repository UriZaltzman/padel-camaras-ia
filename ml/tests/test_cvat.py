"""CVAT export converters: synthetic exports, Parquet round trip and malformed input."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from ml.cvat import (
    BallPointLabel,
    CvatFormatError,
    PlayerBoxLabel,
    parse_coco,
    parse_cvat_video_xml,
    write_frame_annotations,
)
from ml.parquet_io import read_records
from ml.schemas import Camera

META = """
  <meta><task><size>3</size><mode>interpolation</mode>
    <original_size><width>1920</width><height>1080</height></original_size>
    <labels>
      <label><name>person</name><type>rectangle</type></label>
      <label><name>ball</name><type>points</type></label>
    </labels>
  </task></meta>"""

TRACKS = """
  <track id="0" label="person" source="manual">
    <box frame="0" keyframe="1" outside="0" occluded="0"
         xtl="100.5" ytl="200" xbr="180" ybr="400" z_order="0"/>
    <box frame="1" keyframe="0" outside="0" occluded="1"
         xtl="102" ytl="201" xbr="182" ybr="401" z_order="0"/>
    <box frame="2" keyframe="1" outside="1" occluded="0"
         xtl="104" ytl="202" xbr="184" ybr="402" z_order="0"/>
  </track>
  <track id="1" label="person" source="semi-auto">
    <box frame="0" keyframe="1" outside="0" occluded="0"
         xtl="900" ytl="300" xbr="980" ybr="520" z_order="0"/>
  </track>
  <track id="2" label="ball" source="manual">
    <points frame="0" keyframe="1" outside="0" occluded="0" points="640.25,360.75" z_order="0"/>
    <points frame="1" keyframe="1" outside="1" occluded="0" points="0,0" z_order="0"/>
    <points frame="2" keyframe="1" outside="0" occluded="1" points="700,300" z_order="0"/>
  </track>"""


def video_xml(tracks: str = TRACKS, meta: str = META, version: str = "1.1") -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        f"<annotations><version>{version}</version>{meta}{tracks}</annotations>"
    )


def coco(**overrides: object) -> str:
    document: dict[str, object] = {
        "categories": [{"id": 1, "name": "person"}],
        "images": [
            {"id": 1, "file_name": "frame_000000.PNG", "width": 1920, "height": 1080},
            {"id": 2, "file_name": "frame_000007.PNG", "width": 1920, "height": 1080},
        ],
        "annotations": [
            {"id": 1, "image_id": 1, "category_id": 1, "bbox": [100, 200, 80, 200]},
            {
                "id": 2,
                "image_id": 2,
                "category_id": 1,
                "bbox": [10.5, 20, 30, 40],
                "attributes": {"occluded": True},
            },
        ],
    }
    document.update(overrides)
    return json.dumps(document)


def test_video_xml_keeps_every_visible_label() -> None:
    result = parse_cvat_video_xml(video_xml(), Camera.A)
    assert (result.size.width_px, result.size.height_px) == (1920, 1080)
    assert [(b.track_id, b.frame) for b in result.players] == [(0, 0), (1, 0), (0, 1)]
    first = result.players[0]
    assert (first.x_min_px, first.y_min_px, first.x_max_px, first.y_max_px) == (
        100.5,
        200,
        180,
        400,
    )
    assert result.players[2].occluded
    assert [(b.frame, b.x_px, b.y_px, b.occluded) for b in result.balls] == [
        (0, 640.25, 360.75, False),
        (2, 700, 300, True),
    ]


def test_video_xml_round_trips_through_parquet(tmp_path: Path) -> None:
    result = parse_cvat_video_xml(video_xml(), Camera.B)
    boxes_path, balls_path = write_frame_annotations(result, tmp_path)
    assert tuple(read_records(PlayerBoxLabel, boxes_path)) == result.players
    assert tuple(read_records(BallPointLabel, balls_path)) == result.balls


def test_coco_boxes_round_trip(tmp_path: Path) -> None:
    result = parse_coco(coco(), Camera.A)
    assert [(b.frame, b.x_max_px, b.y_max_px, b.occluded) for b in result.players] == [
        (0, 180, 400, False),
        (7, 40.5, 60, True),
    ]
    assert all(b.track_id is None for b in result.players)
    boxes_path, balls_path = write_frame_annotations(result, tmp_path)
    assert tuple(read_records(PlayerBoxLabel, boxes_path)) == result.players
    assert read_records(BallPointLabel, balls_path) == []


BOX = '<box frame="0" outside="0" occluded="0" xtl="{}" ytl="10" xbr="{}" ybr="50"/>'


def person(box: str) -> str:
    return video_xml(tracks=f'<track id="0" label="person">{box}</track>')


def ball(points: str) -> str:
    return video_xml(tracks=f'<track id="0" label="ball">{points}</track>')


@pytest.mark.parametrize(
    ("text", "error"),
    [
        ("<annotations><version>1.1", "not valid XML"),
        ("<root/>", "expected <annotations>"),
        (video_xml(version="2.0"), "format version"),
        (video_xml(meta=""), "original_size"),
        (video_xml(tracks='<track id="0" label="racket"/>'), "unknown label"),
        (ball(BOX.format(1, 2)), "expected <points>"),
        (person(BOX.format(50, 10)), "no area"),
        (person(BOX.format(1, 1999)), "outside the 1920x1080"),
        (person(BOX.format("x", 9)), "not a number"),
        (person('<box frame="0" xtl="1" ytl="1" xbr="9"/>'), "'ybr'"),
        (ball('<points frame="0" points="1,1;2,2"/>'), "one point"),
        (ball('<points frame="-1" points="1,1"/>'), "non-negative integer"),
        (ball('<points frame="0" outside="yes" points="1,1"/>'), "expected 0 or 1"),
        (
            video_xml(
                tracks='<track id="0" label="ball"><points frame="0" points="1,1"/></track>'
                '<track id="1" label="ball"><points frame="0" points="2,2"/></track>'
            ),
            "one ball per frame",
        ),
        (video_xml(tracks='<image id="0" name="frame_0.png"/>'), "CVAT for images"),
    ],
)
def test_video_xml_rejects_malformed_input(text: str, error: str) -> None:
    with pytest.raises(CvatFormatError, match=error):
        parse_cvat_video_xml(text, Camera.A)


def test_video_xml_refuses_entity_declarations() -> None:
    bomb = '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY e "x">]><annotations>&e;</annotations>'
    with pytest.raises(CvatFormatError, match="entities"):
        parse_cvat_video_xml(bomb, Camera.A)


@pytest.mark.parametrize(
    ("text", "error"),
    [
        ("{", "not valid JSON"),
        ("[]", "JSON object"),
        (coco(categories=[{"id": 1, "name": "ball"}]), "only person boxes"),
        (
            coco(annotations=[{"image_id": 9, "category_id": 1, "bbox": [1, 1, 1, 1]}]),
            "unknown image",
        ),
        (coco(annotations=[{"image_id": 1, "category_id": 1, "bbox": [1, 1, 1]}]), "4 numbers"),
        (coco(annotations=[{"image_id": 1, "category_id": 1, "bbox": [1, 1, 0, 5]}]), "no area"),
        (
            coco(annotations=[{"image_id": 1, "category_id": 1, "bbox": [1900, 1, 50, 5]}]),
            "outside",
        ),
        (coco(images=[{"id": 1, "file_name": "x.png", "width": 9, "height": 9}]), "frame number"),
        (
            coco(
                images=[
                    {"id": 1, "file_name": "frame_1.png", "width": 9, "height": 9},
                    {"id": 2, "file_name": "frame_2.png", "width": 8, "height": 9},
                ]
            ),
            "one size",
        ),
    ],
)
def test_coco_rejects_malformed_input(text: str, error: str) -> None:
    with pytest.raises(CvatFormatError, match=error):
        parse_coco(text, Camera.A)
