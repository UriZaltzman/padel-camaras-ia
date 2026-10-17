"""Human labels for training and evaluation (spec section 8, "Qué se etiqueta").

Labelers mark, on the match timeline, every shot (time and player track), every bounce with
the surface it hit, the type of each shot and the winner of each point. These labels are the
ground truth the pipeline of section 5 and the point state machine of section 6 are measured
against.

Labels are grouped in a *label set*: one labeler's pass over one match. A label set is
versioned per match and never overwritten; a correction is saved as a new version. Each set
is stored with the Parquet helpers of ``ml.parquet_io`` in
``<labels_root>/<match_id>/v<version>/<kind>.parquet``.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from datetime import timedelta
from enum import StrEnum
from itertools import pairwise
from pathlib import Path
from typing import Annotated, Self

from pydantic import (
    UUID7,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from ml.parquet_io import PARQUET_SUFFIX, read_records, write_records
from ml.schemas import (
    Camera,
    CourtSide,
    NonNegativeInt,
    ShotType,
    StageRecord,
    Surface,
)

LABEL_SCHEMA_VERSION = "1.0.0"
"""Version of the label models below. Bump it whenever a field is added, removed or changes
meaning, so old label sets are never read with the wrong interpretation."""

VERSION_DIR_PREFIX = "v"

PositiveInt = Annotated[int, Field(ge=1)]
NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
SemVer = Annotated[str, StringConstraints(pattern=r"^\d+\.\d+\.\d+$")]


class Team(StrEnum):
    """The two pairs of a match, as in ``match_players.team`` (spec section 2)."""

    ONE = "1"
    TWO = "2"


class PointEndReason(StrEnum):
    """Why a point ended: the rules of spec section 6, in the order they are evaluated."""

    DOUBLE_FAULT = "double_fault"
    """Rule 1: second serve fault."""
    OWN_FLOOR = "own_floor"
    """Rule 2: the ball hit the hitter's own floor before crossing the net."""
    NET = "net"
    """Rule 3: the ball hit the net and did not cross it."""
    DIRECT_WALL = "direct_wall"
    """Rule 4: after crossing, the first contact was the rival's glass, fence or wall."""
    DOUBLE_BOUNCE = "double_bounce"
    """Rule 5: second bounce on the rival's floor without anyone hitting it."""
    OUT_OF_COURT = "out_of_court"
    """Rule 6: after bouncing on the rival's floor, the ball left the court."""
    BALL_LOST = "ball_lost"
    """Rule 7: the ball could not be seen; decided by the last valid event."""
    OTHER = "other"
    """Anything the rules above do not cover (ball hits a player, stopped point...)."""


class LabelKind(StrEnum):
    """The files that make up a stored label set."""

    INFO = "label_set"
    SHOTS = "shots"
    BOUNCES = "bounces"
    SHOT_TYPES = "shot_types"
    POINTS = "points"


class ShotLabel(StageRecord):
    """A shot marked on the timeline: when it happened, who hit it and on which camera."""

    id: UUID7
    time_ms: NonNegativeInt
    track_id: NonNegativeInt
    camera: Camera


class BounceLabel(StageRecord):
    """A bounce marked on the timeline with the surface it hit (spec section 5.8)."""

    id: UUID7
    time_ms: NonNegativeInt
    surface: Surface
    side: CourtSide
    camera: Camera


class ShotTypeLabel(StageRecord):
    """The type of a labeled shot, chosen on a short clip around it (spec section 5.9).

    ``unknown`` is allowed when the labeler cannot tell; those shots are left out of the
    shot-type training set the same way the classifier's ``unknown`` is left out of stats.
    """

    shot_id: UUID7
    shot_type: ShotType


class PointLabel(StageRecord):
    """A point: when it started and ended, who won it and why it ended (spec section 6)."""

    id: UUID7
    number: PositiveInt
    start_ms: NonNegativeInt
    end_ms: NonNegativeInt
    winner: Team
    end_reason: PointEndReason

    @model_validator(mode="after")
    def _ends_after_it_starts(self) -> Self:
        if self.end_ms <= self.start_ms:
            msg = f"point {self.number} must end after it starts"
            raise ValueError(msg)
        return self


class LabelSetInfo(StageRecord):
    """Who labeled which match, when, and with which version of the label models."""

    match_id: UUID7
    version: PositiveInt
    labeler: NonEmptyStr
    labeled_at: AwareDatetime
    schema_version: SemVer = LABEL_SCHEMA_VERSION

    @field_validator("labeled_at")
    @classmethod
    def _must_be_utc(cls, value: AwareDatetime) -> AwareDatetime:
        if value.utcoffset() != timedelta(0):
            msg = "labeled_at must be in UTC"
            raise ValueError(msg)
        return value


class UnsupportedLabelSchemaError(ValueError):
    """A stored label set was written with a label schema this code cannot read."""


class LabelSetExistsError(FileExistsError):
    """Label set versions are immutable: a correction must be saved as a new version."""


def _duplicates(values: Iterable[object]) -> list[object]:
    return [value for value, count in Counter(values).items() if count > 1]


class MatchLabels(BaseModel):
    """A complete, consistent label set for one match."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    info: LabelSetInfo
    shots: tuple[ShotLabel, ...] = ()
    bounces: tuple[BounceLabel, ...] = ()
    shot_types: tuple[ShotTypeLabel, ...] = ()
    points: tuple[PointLabel, ...] = ()

    @model_validator(mode="after")
    def _is_consistent(self) -> Self:
        ids = (
            [s.id for s in self.shots] + [b.id for b in self.bounces] + [p.id for p in self.points]
        )
        if repeated := _duplicates(ids):
            msg = f"label ids must be unique, repeated: {repeated}"
            raise ValueError(msg)

        shot_ids = {shot.id for shot in self.shots}
        typed = [label.shot_id for label in self.shot_types]
        if repeated := _duplicates(typed):
            msg = f"a shot can have only one type, repeated: {repeated}"
            raise ValueError(msg)
        if orphans := [shot_id for shot_id in typed if shot_id not in shot_ids]:
            msg = f"shot types refer to unknown shots: {orphans}"
            raise ValueError(msg)

        if repeated := _duplicates(point.number for point in self.points):
            msg = f"point numbers must be unique, repeated: {repeated}"
            raise ValueError(msg)
        ordered = sorted(self.points, key=lambda point: point.number)
        for previous, current in pairwise(ordered):
            if current.start_ms < previous.end_ms:
                msg = f"point {current.number} starts before point {previous.number} ends"
                raise ValueError(msg)
        return self


def label_set_dir(labels_root: Path, match_id: UUID7, version: int) -> Path:
    """Folder that holds one version of a match's label set."""
    return labels_root / str(match_id) / f"{VERSION_DIR_PREFIX}{version}"


def _label_path(set_dir: Path, kind: LabelKind) -> Path:
    return set_dir / f"{kind.value}{PARQUET_SUFFIX}"


def list_label_set_versions(labels_root: Path, match_id: UUID7) -> list[int]:
    """Stored versions of a match's label set, oldest first."""
    match_dir = labels_root / str(match_id)
    if not match_dir.is_dir():
        return []
    versions = []
    for child in match_dir.iterdir():
        number = child.name.removeprefix(VERSION_DIR_PREFIX)
        if child.is_dir() and child.name.startswith(VERSION_DIR_PREFIX) and number.isdigit():
            versions.append(int(number))
    return sorted(versions)


def write_label_set(labels_root: Path, labels: MatchLabels) -> Path:
    """Store a label set as a new version and return its folder.

    Raises ``LabelSetExistsError`` if that version of the match is already stored.
    """
    set_dir = label_set_dir(labels_root, labels.info.match_id, labels.info.version)
    if set_dir.exists():
        msg = f"{set_dir} already exists; save the correction as a new version"
        raise LabelSetExistsError(msg)
    write_records(list(labels.shots), ShotLabel, _label_path(set_dir, LabelKind.SHOTS))
    write_records(list(labels.bounces), BounceLabel, _label_path(set_dir, LabelKind.BOUNCES))
    write_records(
        list(labels.shot_types), ShotTypeLabel, _label_path(set_dir, LabelKind.SHOT_TYPES)
    )
    write_records(list(labels.points), PointLabel, _label_path(set_dir, LabelKind.POINTS))
    # The info file goes last: a folder without it is an interrupted write, not a label set.
    write_records([labels.info], LabelSetInfo, _label_path(set_dir, LabelKind.INFO))
    return set_dir


def read_label_set(labels_root: Path, match_id: UUID7, version: int | None = None) -> MatchLabels:
    """Load and validate one version of a match's label set (the latest if not given)."""
    if version is None:
        versions = list_label_set_versions(labels_root, match_id)
        if not versions:
            msg = f"no label sets stored for match {match_id}"
            raise FileNotFoundError(msg)
        version = versions[-1]
    set_dir = label_set_dir(labels_root, match_id, version)
    (info,) = read_records(LabelSetInfo, _label_path(set_dir, LabelKind.INFO))
    if info.schema_version != LABEL_SCHEMA_VERSION:
        msg = (
            f"{set_dir} uses label schema {info.schema_version}, "
            f"this code reads {LABEL_SCHEMA_VERSION}"
        )
        raise UnsupportedLabelSchemaError(msg)
    if info.match_id != match_id or info.version != version:
        msg = f"{set_dir} holds match {info.match_id} version {info.version}"
        raise ValueError(msg)
    return MatchLabels(
        info=info,
        shots=tuple(read_records(ShotLabel, _label_path(set_dir, LabelKind.SHOTS))),
        bounces=tuple(read_records(BounceLabel, _label_path(set_dir, LabelKind.BOUNCES))),
        shot_types=tuple(read_records(ShotTypeLabel, _label_path(set_dir, LabelKind.SHOT_TYPES))),
        points=tuple(read_records(PointLabel, _label_path(set_dir, LabelKind.POINTS))),
    )
