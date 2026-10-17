"""Agent settings, read from environment variables and validated at startup.

A misconfigured agent must refuse to start instead of failing halfway through a match.
Secrets never have defaults and never live in the repo.
"""

from pathlib import Path
from typing import Literal
from uuid import UUID

from pydantic import Field, HttpUrl, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PREFIX = "EDGE_"
DB_FILENAME = "edge-agent.sqlite3"

LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]


class SettingsError(Exception):
    """Raised when the environment does not hold a valid configuration."""


class EdgeSettings(BaseSettings):
    """Configuration of one club box. Every field maps to ``EDGE_<FIELD>``."""

    model_config = SettingsConfigDict(
        env_prefix=ENV_PREFIX,
        extra="ignore",
        frozen=True,
    )

    club_id: UUID = Field(description="Club this box belongs to.")
    device_id: UUID = Field(description="Identifier of this box, issued at provisioning.")
    api_base_url: HttpUrl = Field(description="Base URL of the cloud API (/device/*).")
    data_dir: Path = Field(
        default=Path("/var/lib/edge-agent"),
        description="Directory for the local SQLite store and working files.",
    )
    log_level: LogLevel = Field(default="INFO", description="Minimum log level.")

    @property
    def db_path(self) -> Path:
        return self.data_dir / DB_FILENAME


def _describe(error: ValidationError) -> str:
    lines = []
    for item in error.errors(include_input=False):
        field = ".".join(str(part) for part in item["loc"])
        env_var = f"{ENV_PREFIX}{field}".upper()
        reason = "missing" if item["type"] == "missing" else item["msg"]
        lines.append(f"  - {env_var}: {reason}")
    return "Invalid edge-agent configuration:\n" + "\n".join(lines)


def load_settings() -> EdgeSettings:
    """Read and validate the settings, or raise ``SettingsError`` with a readable message.

    The message names the environment variables only; it never echoes their values.
    """
    try:
        return EdgeSettings()
    except ValidationError as error:
        raise SettingsError(_describe(error)) from None
