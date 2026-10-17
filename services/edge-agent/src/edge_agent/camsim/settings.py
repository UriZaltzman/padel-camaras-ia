"""Simulator settings, read from ``CAMSIM_*`` environment variables."""

from pathlib import Path
from typing import Final

from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

from edge_agent.settings import LogLevel, SettingsError, describe_validation_error

ENV_PREFIX: Final = "CAMSIM_"
MAX_COURTS: Final = 16
RTSP_BASE_PATTERN: Final = r"^rtsps?://[^/\s]+/?$"
STATE_FILENAME: Final = "cameras.json"


class SimulatorSettings(BaseSettings):
    """Every field maps to ``CAMSIM_<FIELD>``."""

    model_config = SettingsConfigDict(env_prefix=ENV_PREFIX, extra="ignore", frozen=True)

    courts: int = Field(default=2, ge=1, le=MAX_COURTS, description="Courts to simulate.")
    rtsp_url: str = Field(
        default="rtsp://localhost:8554",
        pattern=RTSP_BASE_PATTERN,
        description="RTSP server the cameras publish to (no path).",
    )
    advertised_rtsp_url: str | None = Field(
        default=None,
        pattern=RTSP_BASE_PATTERN,
        description="Base URL readers should use, when it differs from rtsp_url (Docker).",
    )
    video_dir: Path = Field(
        default=Path("/videos"),
        description="Recorded videos: <camera>.mp4 or default.mp4.",
    )
    state_dir: Path = Field(
        default=Path("/var/lib/edge-agent/camsim"),
        description="Which cameras are stopped, plus the generated test video.",
    )
    ffmpeg_bin: str = Field(default="ffmpeg", min_length=1)
    ffprobe_bin: str = Field(default="ffprobe", min_length=1)
    test_video_size: str = Field(default="2560x1440", pattern=r"^[1-9][0-9]*x[1-9][0-9]*$")
    test_video_fps: int = Field(default=25, ge=1, le=120)
    test_video_seconds: int = Field(default=10, ge=1, le=3600)
    log_level: LogLevel = "INFO"

    @property
    def state_path(self) -> Path:
        return self.state_dir / STATE_FILENAME

    @property
    def reader_rtsp_url(self) -> str:
        return self.advertised_rtsp_url or self.rtsp_url


def load_simulator_settings() -> SimulatorSettings:
    try:
        return SimulatorSettings()
    except ValidationError as error:
        raise SettingsError(
            describe_validation_error(error, prefix=ENV_PREFIX, what="camera simulator")
        ) from None
