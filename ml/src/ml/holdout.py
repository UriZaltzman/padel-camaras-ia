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

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

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


class HoldoutRegistry(BaseModel):
    """The versioned list of evaluation matches plus the rules it must satisfy."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    version: PositiveInt
    required_matches: PositiveInt
    min_day_matches: NonNegativeInt
    min_night_matches: NonNegativeInt
    min_distinct_courts: PositiveInt
    matches: tuple[HoldoutMatch, ...]

    @model_validator(mode="after")
    def _check_list(self) -> Self:
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
    training_match_ids: Iterable[str], registry: HoldoutRegistry | None = None
) -> None:
    """Raise :class:`HoldoutLeakError` if any training match id is in the holdout.

    With no ``registry`` the versioned ``ml/config/holdout.yaml`` is loaded, so callers cannot
    accidentally check against a stale copy.
    """
    holdout = registry if registry is not None else load_holdout()
    leaked = holdout.match_ids.intersection(training_match_ids)
    if leaked:
        raise HoldoutLeakError(leaked)
