"""Recorder settings, read from ``EDGE_RECORDER_*`` environment variables.

Camera URLs may carry the camera's user and password, so they are ``SecretStr``: they
never show up in a repr, an error message or a log.
"""

from pathlib import Path
from typing import Annotated, Final
from urllib.parse import urlsplit

from pydantic import AfterValidator, Field, SecretStr, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from edge_agent.recorder.segments import validate_camera_name
from edge_agent.settings import SettingsError, describe_validation_error

ENV_PREFIX: Final = "EDGE_RECORDER_"
RTSP_SCHEMES: Final = frozenset({"rtsp", "rtsps"})
SEGMENTS_DIRNAME: Final = "segments"

CameraName = Annotated[str, AfterValidator(validate_camera_name)]


class RecorderSettings(BaseSettings):
    """Every field maps to ``EDGE_RECORDER_<FIELD>``."""

    model_config = SettingsConfigDict(env_prefix=ENV_PREFIX, extra="ignore", frozen=True)

    cameras: dict[CameraName, SecretStr] = Field(
        min_length=1,
        description='JSON object camera -> RTSP URL, e.g. {"court-1-a": "rtsp://..."}.',
    )
    segments_dir: Path | None = Field(
        default=None, description="Where segments go. Default: <EDGE_DATA_DIR>/segments."
    )
    ffmpeg_bin: str = Field(default="ffmpeg", min_length=1)
    ffprobe_bin: str = Field(default="ffprobe", min_length=1)

    @field_validator("cameras")
    @classmethod
    def _rtsp_only(cls, cameras: dict[str, SecretStr]) -> dict[str, SecretStr]:
        for name, url in cameras.items():
            try:
                parts = urlsplit(url.get_secret_value())
            except ValueError:
                parts = None
            if parts is None or parts.scheme not in RTSP_SCHEMES or not parts.hostname:
                # Name the camera only: the URL may hold its password.
                msg = f"camera {name}: expected an rtsp:// or rtsps:// URL with a host"
                raise ValueError(msg)
        return cameras

    def segments_root(self, data_dir: Path) -> Path:
        return self.segments_dir or data_dir / SEGMENTS_DIRNAME


def load_recorder_settings() -> RecorderSettings:
    try:
        return RecorderSettings()
    except ValidationError as error:
        raise SettingsError(
            describe_validation_error(error, prefix=ENV_PREFIX, what="recorder")
        ) from None
