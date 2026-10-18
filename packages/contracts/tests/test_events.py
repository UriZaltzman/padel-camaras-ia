"""The generated Pydantic event models exist for the 12 events and accept their examples."""

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import BaseModel, ValidationError

from app_contracts import events
from app_contracts.events import BookingConfirmedEvent, DomainEvent, EventType

EVENTS_DIR = Path(__file__).resolve().parent.parent / "events"

SECTION_11 = {
    "booking.confirmed": "BookingConfirmedEvent",
    "booking.cancelled": "BookingCancelledEvent",
    "match.recording_started": "MatchRecordingStartedEvent",
    "match.recorded": "MatchRecordedEvent",
    "match.processed": "MatchProcessedEvent",
    "match.published": "MatchPublishedEvent",
    "match.score_corrected": "MatchScoreCorrectedEvent",
    "clip.created": "ClipCreatedEvent",
    "payment.approved": "PaymentApprovedEvent",
    "payment.refunded": "PaymentRefundedEvent",
    "device.offline": "DeviceOfflineEvent",
    "settlement.ready": "SettlementReadyEvent",
}


def _example(event_type: str) -> dict[str, Any]:
    schema = json.loads((EVENTS_DIR / f"{event_type}.schema.json").read_text())
    example: dict[str, Any] = schema["examples"][0]
    return example


def test_event_type_enum_lists_section_11() -> None:
    assert {e.value for e in EventType} == set(SECTION_11)


@pytest.mark.parametrize(("event_type", "class_name"), SECTION_11.items())
def test_model_parses_the_schema_example(event_type: str, class_name: str) -> None:
    model: type[BaseModel] = getattr(events, class_name)
    parsed = model.model_validate(_example(event_type))
    assert parsed.model_dump(mode="json")["event_type"] == event_type
    assert type(DomainEvent.model_validate(_example(event_type)).root) is model


@pytest.mark.parametrize("field", ["event_id", "occurred_at", "schema_version", "payload"])
def test_envelope_fields_are_required(field: str) -> None:
    data = _example("booking.confirmed")
    del data[field]
    with pytest.raises(ValidationError):
        BookingConfirmedEvent.model_validate(data)


def test_event_id_must_be_uuid_v7() -> None:
    data = _example("booking.confirmed") | {"event_id": "9b2e4c1a-3f5d-4e6a-8b7c-1d2e3f4a5b6c"}
    with pytest.raises(ValidationError):
        BookingConfirmedEvent.model_validate(data)


def test_unknown_schema_version_is_rejected() -> None:
    with pytest.raises(ValidationError):
        BookingConfirmedEvent.model_validate(_example("booking.confirmed") | {"schema_version": 2})
