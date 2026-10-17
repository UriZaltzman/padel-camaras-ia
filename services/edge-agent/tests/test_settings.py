from pathlib import Path
from uuid import UUID

import pytest

from edge_agent.settings import DB_FILENAME, SettingsError, load_settings

from .conftest import CLUB_ID


def test_loads_valid_environment(valid_env: Path) -> None:
    settings = load_settings()

    assert settings.club_id == UUID(CLUB_ID)
    assert settings.log_level == "INFO"
    assert settings.db_path == valid_env / DB_FILENAME


def test_missing_required_variable_fails_with_clear_message(
    valid_env: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("EDGE_CLUB_ID")

    with pytest.raises(SettingsError) as excinfo:
        load_settings()

    assert "EDGE_CLUB_ID: missing" in str(excinfo.value)


def test_empty_environment_lists_every_required_variable() -> None:
    with pytest.raises(SettingsError) as excinfo:
        load_settings()

    message = str(excinfo.value)
    for var in ("EDGE_CLUB_ID", "EDGE_DEVICE_ID", "EDGE_API_BASE_URL"):
        assert f"{var}: missing" in message
    assert "EDGE_DATA_DIR" not in message


def test_invalid_value_is_named_but_not_echoed(
    valid_env: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("EDGE_DEVICE_ID", "not-a-uuid-s3cr3t")

    with pytest.raises(SettingsError) as excinfo:
        load_settings()

    assert "EDGE_DEVICE_ID" in str(excinfo.value)
    assert "s3cr3t" not in str(excinfo.value)


def test_rejects_unknown_log_level(valid_env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EDGE_LOG_LEVEL", "LOUD")

    with pytest.raises(SettingsError, match="EDGE_LOG_LEVEL"):
        load_settings()
