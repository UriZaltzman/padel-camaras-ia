"""The generated Pydantic models enforce the contract at the Python borders (edge-agent, ml)."""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app_contracts.models import AmountCents, Error, ErrorCode, Page, Timestamp


def test_error_parses_the_contract_example() -> None:
    error = Error.model_validate(
        {
            "code": "BOOKING_SLOT_TAKEN",
            "message": "texto de prueba",
            "details": {"court_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b"},
        }
    )
    assert error.code is ErrorCode.BOOKING_SLOT_TAKEN
    assert error.details == {"court_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b"}


def test_error_rejects_a_code_outside_the_catalog() -> None:
    with pytest.raises(ValidationError):
        Error.model_validate({"code": "SOMETHING_ELSE", "message": "x"})


def test_error_requires_message() -> None:
    with pytest.raises(ValidationError):
        Error.model_validate({"code": "NOT_FOUND"})


def test_page_last_page_has_null_cursor() -> None:
    assert Page.model_validate({"next_cursor": None}).next_cursor is None


def test_amount_cents_is_never_negative() -> None:
    assert AmountCents.model_validate(1500000).root == 1500000
    with pytest.raises(ValidationError):
        AmountCents.model_validate(-1)


def test_timestamp_requires_a_timezone() -> None:
    assert Timestamp.model_validate("2026-10-17T21:30:00Z").root == datetime(
        2026, 10, 17, 21, 30, tzinfo=UTC
    )
    with pytest.raises(ValidationError):
        Timestamp.model_validate("2026-10-17T21:30:00")
