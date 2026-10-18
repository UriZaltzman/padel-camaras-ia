"""Typed loader for ``ml/config/labeling.yaml``: server, timeline steps and shortcuts."""

from __future__ import annotations

from enum import StrEnum
from pathlib import Path
from typing import Annotated, Self

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ml.schemas import Surface

_PROJECT_DIR = Path(__file__).resolve().parent.parent.parent.parent
DEFAULT_LABELING_CONFIG_PATH = _PROJECT_DIR / "config" / "labeling.yaml"

PositiveInt = Annotated[int, Field(gt=0)]


class _Section(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Action(StrEnum):
    """What a keyboard shortcut does. The browser handles playback; the rest edit labels."""

    PLAY_PAUSE = "play_pause"
    SEEK_BACK = "seek_back"
    SEEK_FORWARD = "seek_forward"
    SEEK_BACK_FINE = "seek_back_fine"
    SEEK_FORWARD_FINE = "seek_forward_fine"
    CYCLE_RATE = "cycle_rate"
    SHOT = "shot"
    BOUNCE = "bounce"
    TOGGLE_SIDE = "toggle_side"
    SELECT_PREV = "select_prev"
    SELECT_NEXT = "select_next"
    NUDGE_BACK = "nudge_back"
    NUDGE_FORWARD = "nudge_forward"
    MOVE_TO_PLAYHEAD = "move_to_playhead"
    DELETE_SELECTED = "delete_selected"
    UNDO = "undo"
    SAVE = "save"


class Shortcut(_Section):
    key: str = Field(min_length=1)
    action: Action
    track_id: Annotated[int, Field(ge=0)] | None = None
    surface: Surface | None = None

    @model_validator(mode="after")
    def _has_its_argument(self) -> Self:
        if (self.action is Action.SHOT) != (self.track_id is not None):
            msg = f"shortcut {self.key!r}: track_id goes with, and only with, action shot"
            raise ValueError(msg)
        if (self.action is Action.BOUNCE) != (self.surface is not None):
            msg = f"shortcut {self.key!r}: surface goes with, and only with, action bounce"
            raise ValueError(msg)
        return self


LOOPBACK_HOST_NAMES = ("127.0.0.1", "localhost")
"""The only addresses the tool may listen on: it must never be reachable from a network."""


class ServerConfig(_Section):
    host: str
    port: PositiveInt
    video_chunk_bytes: PositiveInt
    max_body_bytes: PositiveInt

    @field_validator("host")
    @classmethod
    def _must_be_loopback(cls, value: str) -> str:
        if value not in LOOPBACK_HOST_NAMES:
            msg = f"host must be one of {LOOPBACK_HOST_NAMES}, got {value!r}"
            raise ValueError(msg)
        return value


class TimelineConfig(_Section):
    seek_step_ms: PositiveInt
    fine_step_ms: PositiveInt
    nudge_step_ms: PositiveInt
    playback_rates: list[Annotated[float, Field(gt=0)]] = Field(min_length=1)


class LabelingConfig(_Section):
    server: ServerConfig
    timeline: TimelineConfig
    shortcuts: list[Shortcut] = Field(min_length=1)

    @model_validator(mode="after")
    def _keys_are_unique(self) -> Self:
        keys = [shortcut.key for shortcut in self.shortcuts]
        if repeated := sorted({key for key in keys if keys.count(key) > 1}):
            msg = f"shortcut keys must be unique, repeated: {repeated}"
            raise ValueError(msg)
        return self


def load_labeling_config(path: Path = DEFAULT_LABELING_CONFIG_PATH) -> LabelingConfig:
    """Load and validate the labeling tool settings."""
    with path.open(encoding="utf-8") as file:
        return LabelingConfig.model_validate(yaml.safe_load(file))
