"""Uploader settings, read from ``EDGE_UPLOADER_*`` environment variables.

Access keys are ``SecretStr``: they never show up in a repr, an error message or a log.
"""

from typing import Final

from pydantic import Field, HttpUrl, SecretStr, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

from edge_agent.settings import SettingsError, describe_validation_error

ENV_PREFIX: Final = "EDGE_UPLOADER_"
MIB: Final = 1024 * 1024
# S3 rejects non-final parts below 5 MiB.
S3_MIN_PART_BYTES: Final = 5 * MIB
DEFAULT_PART_BYTES: Final = 8 * MIB
# 1.5 Mbps: the video bitrate the spec plans for a club upload link.
DEFAULT_BANDWIDTH_BYTES_PER_S: Final = 1_500_000 // 8
DEFAULT_CHUNK_BYTES: Final = 64 * 1024
DEFAULT_POLL_S: Final = 30.0
DEFAULT_RETRY_S: Final = 15.0


class UploaderSettings(BaseSettings):
    """Every field maps to ``EDGE_UPLOADER_<FIELD>``."""

    model_config = SettingsConfigDict(env_prefix=ENV_PREFIX, extra="ignore", frozen=True)

    endpoint_url: HttpUrl = Field(description="S3-compatible endpoint (R2, MinIO, ...).")
    bucket: str = Field(min_length=3, max_length=63)
    region: str = Field(default="auto", min_length=1)
    access_key_id: SecretStr
    secret_access_key: SecretStr
    key_prefix: str = Field(default="segments/", description="Prefix of every object key.")
    part_size_bytes: int = Field(default=DEFAULT_PART_BYTES, ge=S3_MIN_PART_BYTES)
    bandwidth_limit_bytes_per_s: int = Field(
        default=DEFAULT_BANDWIDTH_BYTES_PER_S, gt=0, description="Upload cap, bytes/s."
    )
    chunk_bytes: int = Field(
        default=DEFAULT_CHUNK_BYTES, gt=0, description="Read/throttle granularity."
    )
    poll_interval_s: float = Field(default=DEFAULT_POLL_S, gt=0)
    retry_interval_s: float = Field(default=DEFAULT_RETRY_S, gt=0)


def load_uploader_settings() -> UploaderSettings:
    try:
        return UploaderSettings()
    except ValidationError as error:
        raise SettingsError(
            describe_validation_error(error, prefix=ENV_PREFIX, what="uploader")
        ) from None
