import os
from pathlib import Path

import pytest

# Fixture values only: not real clubs, devices or hosts.
CLUB_ID = "0192f0c8-0000-7000-8000-000000000001"
DEVICE_ID = "0192f0c8-0000-7000-8000-0000000000d1"
API_BASE_URL = "http://api.test"


@pytest.fixture(autouse=True)
def clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make sure no EDGE_* / CAMSIM_* variable from the developer's shell leaks into a test."""
    for key in list(os.environ):
        if key.startswith(("EDGE_", "CAMSIM_")):
            monkeypatch.delenv(key)


@pytest.fixture
def valid_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    monkeypatch.setenv("EDGE_CLUB_ID", CLUB_ID)
    monkeypatch.setenv("EDGE_DEVICE_ID", DEVICE_ID)
    monkeypatch.setenv("EDGE_API_BASE_URL", API_BASE_URL)
    monkeypatch.setenv("EDGE_DATA_DIR", str(tmp_path))
    return tmp_path
