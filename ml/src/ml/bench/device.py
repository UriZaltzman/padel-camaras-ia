"""Best-effort description of the machine running the benchmark. No GPU library needed."""

from __future__ import annotations

import os
import platform
import shutil
import subprocess

from pydantic import BaseModel, ConfigDict


class DeviceInfo(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    hostname: str
    os: str
    python: str
    cpu: str
    cpu_count: int
    gpus: list[str]
    """GPU names reported by ``nvidia-smi``; empty when it is not installed."""


def _nvidia_gpus() -> list[str]:
    binary = shutil.which("nvidia-smi")
    if binary is None:
        return []
    try:
        result = subprocess.run(  # noqa: S603 -- fixed argv, binary resolved from PATH
            [binary, "--query-gpu=name,driver_version,memory.total", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            check=True,
            timeout=float(os.cpu_count() or 1),
        )
    except (OSError, subprocess.SubprocessError):
        return []
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def detect_device() -> DeviceInfo:
    return DeviceInfo(
        hostname=platform.node(),
        os=platform.platform(),
        python=platform.python_version(),
        cpu=platform.processor() or platform.machine(),
        cpu_count=os.cpu_count() or 0,
        gpus=_nvidia_gpus(),
    )
