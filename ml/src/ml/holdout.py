"""Fixed evaluation holdout: loader for ``ml/config/holdout.yaml`` and the training guard.

Spec section 8 keeps 15 own matches out of training forever. Every training or fine-tuning
entry point must call :func:`assert_no_holdout_in_training` with the match ids it is about to
use; it raises :class:`HoldoutLeakError` if any of them belongs to the holdout.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from datetime import date
from enum import StrEnum
from pathlib import Path
from typing import Annotated, Self
from uuid import UUID

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

_PROJECT_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_HOLDOUT_PATH = _PROJECT_DIR / "config" / "holdout.yaml"

NonEmptyStr = Annotated[str, Field(min_length=1)]
PositiveInt = Annotated[int, Field(gt=0)]
NonNegativeInt = Annotated[int, Field(ge=0)]


class Lighting(StrEnum):
    DAY = "day"
    NIGHT = "night"


class HoldoutMatch(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    match_id: NonEmptyStr
    recorded_on: date
    club_id: NonEmptyStr
    court_id: NonEmptyStr
    lighting: Lighting

    @field_validator("match_id", mode="before")
    @classmethod
    def _normalize(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value


def normalize_match_id(raw: object, uuid_version: int) -> str:
    """Return the canonical form of a match id; raise if it is not a UUID of that version."""
    if not isinstance(raw, str):
        msg = f"match id must be a string, got {type(raw).__name__}"
        raise TypeError(msg)
    try:
        parsed = UUID(raw.strip().lower())
    except ValueError as error:
        msg = f"match id is not a UUID: {raw!r}"
        raise ValueError(msg) from error
    if parsed.version != uuid_version:
        msg = f"match id is not a UUID v{uuid_version}: {raw!r}"
        raise ValueError(msg)
    return str(parsed)


class HoldoutRegistry(BaseModel):
    """The versioned list of evaluation matches plus the rules it must satisfy."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    version: PositiveInt
    match_id_uuid_version: PositiveInt
    required_matches: PositiveInt
    min_day_matches: NonNegativeInt
    min_night_matches: NonNegativeInt
    min_distinct_courts: PositiveInt
    matches: tuple[HoldoutMatch, ...]

    @model_validator(mode="after")
    def _check_list(self) -> Self:
        for match in self.matches:
            normalize_match_id(match.match_id, self.match_id_uuid_version)
        counts = Counter(match.match_id for match in self.matches)
        duplicates = sorted(match_id for match_id, count in counts.items() if count > 1)
        if duplicates:
            msg = f"duplicate holdout match ids: {duplicates}"
            raise ValueError(msg)
        if len(self.matches) > self.required_matches:
            msg = f"holdout has {len(self.matches)} matches, more than required_matches"
            raise ValueError(msg)
        if self.min_day_matches + self.min_night_matches > self.required_matches:
            msg = "min_day_matches + min_night_matches exceeds required_matches"
            raise ValueError(msg)
        return self

    @property
    def match_ids(self) -> frozenset[str]:
        return frozenset(match.match_id for match in self.matches)

    def missing_requirements(self) -> list[str]:
        """Return why the holdout is not yet usable for evaluation; empty when it is."""
        problems: list[str] = []
        if len(self.matches) < self.required_matches:
            problems.append(f"{len(self.matches)} of {self.required_matches} matches recorded")
        day = sum(match.lighting is Lighting.DAY for match in self.matches)
        night = sum(match.lighting is Lighting.NIGHT for match in self.matches)
        if day < self.min_day_matches:
            problems.append(f"{day} day matches, need {self.min_day_matches}")
        if night < self.min_night_matches:
            problems.append(f"{night} night matches, need {self.min_night_matches}")
        courts = {(match.club_id, match.court_id) for match in self.matches}
        if len(courts) < self.min_distinct_courts:
            problems.append(f"{len(courts)} distinct courts, need {self.min_distinct_courts}")
        return problems

    @property
    def is_complete(self) -> bool:
        return not self.missing_requirements()


class HoldoutLeakError(RuntimeError):
    """A training set contains a match reserved for evaluation."""

    def __init__(self, leaked: Iterable[str]) -> None:
        self.leaked = tuple(sorted(leaked))
        super().__init__(f"holdout matches must never be used for training: {list(self.leaked)}")


def load_holdout(path: Path = DEFAULT_HOLDOUT_PATH) -> HoldoutRegistry:
    """Read and validate the holdout file. Raises ``ValidationError`` if it is invalid."""
    with path.open(encoding="utf-8") as handle:
        raw: object = yaml.safe_load(handle)
    return HoldoutRegistry.model_validate(raw)


def assert_no_holdout_in_training(
    training_match_ids: Iterable[str] | str | bytes, registry: HoldoutRegistry | None = None
) -> None:
    """Raise :class:`HoldoutLeakError` if any training match id is in the holdout.

    Ids are compared as canonical UUIDs (stripped, lowercase); a malformed id raises
    ``ValueError`` and a single string instead of a collection raises ``TypeError``.

    With no ``registry`` the versioned ``ml/config/holdout.yaml`` is loaded, so callers cannot
    accidentally check against a stale copy.
    """
    if isinstance(training_match_ids, str | bytes):
        msg = "training_match_ids must be an iterable of ids, not a single string"
        raise TypeError(msg)
    holdout = registry if registry is not None else load_holdout()
    version = holdout.match_id_uuid_version
    normalized = {normalize_match_id(match_id, version) for match_id in training_match_ids}
    leaked = holdout.match_ids.intersection(normalized)
    if leaked:
        raise HoldoutLeakError(leaked)
