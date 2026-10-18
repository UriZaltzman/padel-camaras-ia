# Generated from packages/contracts/events/*.schema.json by `pnpm contracts:generate`.
# Do not edit: change the event schemas and regenerate.

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, RootModel


class Uuid(RootModel[str]):
    root: Annotated[
        str, Field(pattern="^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
    ]
    """
    UUID v7, lowercase. Same as `Uuid` in openapi.yaml.
    """


class Timestamp(RootModel[AwareDatetime]):
    root: AwareDatetime
    """
    RFC 3339 timestamp in UTC (ends in `Z`). Same as `Timestamp` in openapi.yaml.
    """


class AmountCents(RootModel[int]):
    root: Annotated[int, Field(ge=0)]
    """
    Amount in ARS cents. Never decimals. Same as `AmountCents` in openapi.yaml.
    """


class SchemaVersion(RootModel[int]):
    root: Annotated[int, Field(ge=1)]
    """
    Version of the event schema. A breaking payload change bumps it.
    """


class MatchStatus(StrEnum):
    """
    `MatchStatus` of openapi.yaml.
    """

    scheduled = "scheduled"
    recording = "recording"
    recorded = "recorded"
    processing = "processing"
    published = "published"
    needs_review = "needs_review"
    archived = "archived"
    failed = "failed"
    cancelled = "cancelled"


class BookingStatus(StrEnum):
    """
    `BookingStatus` of openapi.yaml.
    """

    held = "held"
    confirmed = "confirmed"
    completed = "completed"
    cancelled = "cancelled"
    no_show = "no_show"
    expired = "expired"


class ProcessingJobStatus(StrEnum):
    """
    `ProcessingJobStatus` of openapi.yaml.
    """

    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


class PaymentStatus(StrEnum):
    """
    `PaymentStatus` of openapi.yaml.
    """

    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    refunded = "refunded"


class SettlementStatus(StrEnum):
    """
    `SettlementStatus` of openapi.yaml.
    """

    draft = "draft"
    approved = "approved"
    invoiced = "invoiced"
    paid = "paid"


class BookingCancelledPayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    booking_id: Uuid
    club_id: Uuid
    court_id: Uuid
    status: Literal["cancelled"]
    cancelled_by_user_id: Uuid | None
    """
    Null when the system cancelled it.
    """
    starts_at: Timestamp
    refund_due: bool
    """
    Whether the cancellation policy returns the deposit.
    """


class BookingCancelledEvent(BaseModel):
    """
    `booking.cancelled`: A confirmed booking moved `confirmed` -> `cancelled`.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    event_id: Uuid
    event_type: Literal["booking.cancelled"]
    occurred_at: Timestamp
    schema_version: Literal[1]
    payload: Annotated[BookingCancelledPayload, Field(title="BookingCancelledPayload")]


class BookingConfirmedPayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    booking_id: Uuid
    club_id: Uuid
    court_id: Uuid
    organizer_user_id: Uuid
    status: Literal["confirmed"]
    starts_at: Timestamp
    ends_at: Timestamp
    payment_id: Uuid | None
    """
    Deposit payment; null when the club loaded the booking by hand.
    """


class BookingConfirmedEvent(BaseModel):
    """
    `booking.confirmed`: A held booking was paid (or confirmed by the club) and moved `held` -> `confirmed`.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    event_id: Uuid
    event_type: Literal["booking.confirmed"]
    occurred_at: Timestamp
    schema_version: Literal[1]
    payload: Annotated[BookingConfirmedPayload, Field(title="BookingConfirmedPayload")]


class ClipSource(StrEnum):
    app_tap = "app_tap"
    court_button = "court_button"
    auto_highlight = "auto_highlight"


class ClipCreatedPayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    clip_id: Uuid
    match_id: Uuid
    club_id: Uuid
    created_by_user_id: Uuid | None
    """
    Null for automatic highlights.
    """
    source: Annotated[ClipSource, Field(title="ClipSource")]
    start_ms: Annotated[int, Field(ge=0)]
    end_ms: Annotated[int, Field(ge=0)]


class ClipCreatedEvent(BaseModel):
    """
    `clip.created`: A clip was cut from a match video (tap in the app, button on court or automatic highlight).
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    event_id: Uuid
    event_type: Literal["clip.created"]
    occurred_at: Timestamp
    schema_version: Literal[1]
    payload: Annotated[ClipCreatedPayload, Field(title="ClipCreatedPayload")]


class DeviceOfflinePayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    device_id: Uuid
    club_id: Uuid
    last_heartbeat_at: Timestamp
    offline_since: Timestamp


class DeviceOfflineEvent(BaseModel):
    """
    `device.offline`: A club device stopped sending heartbeats.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    event_id: Uuid
    event_type: Literal["device.offline"]
    occurred_at: Timestamp
    schema_version: Literal[1]
    payload: Annotated[DeviceOfflinePayload, Field(title="DeviceOfflinePayload")]


class ProcessingJobOutcome(StrEnum):
    """
    Final `ProcessingJobStatus` of the job.
    """

    succeeded = "succeeded"
    failed = "failed"


class MatchProcessedStatus(StrEnum):
    """
    `MatchStatus` the match moved to from `processing`.
    """

    published = "published"
    failed = "failed"


class MatchProcessedPayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    match_id: Uuid
    club_id: Uuid
    processing_job_id: Uuid
    job_status: Annotated[ProcessingJobOutcome, Field(title="ProcessingJobOutcome")]
    """
    Final `ProcessingJobStatus` of the job.
    """
    match_status: Annotated[MatchProcessedStatus, Field(title="MatchProcessedStatus")]
    """
    `MatchStatus` the match moved to from `processing`.
    """
    failure_reason: str | None
    """
    Null when the job succeeded.
    """


class MatchProcessedEvent(BaseModel):
    """
    `match.processed`: The analysis job of a match finished, successfully or not. The match leaves `processing` for `published` or `failed`.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    event_id: Uuid
    event_type: Literal["match.processed"]
    occurred_at: Timestamp
    schema_version: Literal[1]
    payload: Annotated[MatchProcessedPayload, Field(title="MatchProcessedPayload")]


class MatchPublishedPayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    match_id: Uuid
    club_id: Uuid
    status: Literal["published"]
    player_user_ids: list[Uuid]
    """
    Players already linked to the match, to notify.
    """


class MatchPublishedEvent(BaseModel):
    """
    `match.published`: Video, score and stats are visible to the players: the match is `published` (after processing or after a review).
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    event_id: Uuid
    event_type: Literal["match.published"]
    occurred_at: Timestamp
    schema_version: Literal[1]
    payload: Annotated[MatchPublishedPayload, Field(title="MatchPublishedPayload")]


class MatchRecordedPayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    match_id: Uuid
    club_id: Uuid
    court_id: Uuid
    device_id: Uuid
    status: Literal["recorded"]
    started_at: Timestamp
    ended_at: Timestamp
    duration_seconds: Annotated[int, Field(ge=0)]


class MatchRecordedEvent(BaseModel):
    """
    `match.recorded`: Recording ended and the video was uploaded: `recording` -> `recorded`.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    event_id: Uuid
    event_type: Literal["match.recorded"]
    occurred_at: Timestamp
    schema_version: Literal[1]
    payload: Annotated[MatchRecordedPayload, Field(title="MatchRecordedPayload")]


class MatchRecordingStartedPayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    match_id: Uuid
    club_id: Uuid
    court_id: Uuid
    device_id: Uuid
    booking_id: Uuid | None
    status: Literal["recording"]
    started_at: Timestamp


class MatchRecordingStartedEvent(BaseModel):
    """
    `match.recording_started`: The club device started recording: `scheduled` -> `recording`.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    event_id: Uuid
    event_type: Literal["match.recording_started"]
    occurred_at: Timestamp
    schema_version: Literal[1]
    payload: Annotated[MatchRecordingStartedPayload, Field(title="MatchRecordingStartedPayload")]


class SetScore(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    team_1: Annotated[int, Field(ge=0)]
    team_2: Annotated[int, Field(ge=0)]


class MatchScoreCorrectedPayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    match_id: Uuid
    club_id: Uuid
    corrected_by_user_id: Uuid
    status: Literal["needs_review"]
    sets: Annotated[list[SetScore], Field(max_length=5, min_length=1)]
    """
    Corrected games per set.
    """


class MatchScoreCorrectedEvent(BaseModel):
    """
    `match.score_corrected`: A player corrected the score: `published` -> `needs_review`.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    event_id: Uuid
    event_type: Literal["match.score_corrected"]
    occurred_at: Timestamp
    schema_version: Literal[1]
    payload: Annotated[MatchScoreCorrectedPayload, Field(title="MatchScoreCorrectedPayload")]


class PaymentApprovedPayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    payment_id: Uuid
    user_id: Uuid
    club_id: Uuid | None
    booking_id: Uuid | None
    status: Literal["approved"]
    amount_cents: AmountCents
    currency: Literal["ARS"]
    provider_payment_id: Annotated[str, Field(min_length=1)]
    """
    Mercado Pago payment id.
    """


class PaymentApprovedEvent(BaseModel):
    """
    `payment.approved`: The Mercado Pago webhook approved a payment: `pending` -> `approved`.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    event_id: Uuid
    event_type: Literal["payment.approved"]
    occurred_at: Timestamp
    schema_version: Literal[1]
    payload: Annotated[PaymentApprovedPayload, Field(title="PaymentApprovedPayload")]


class PaymentRefundedPayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    payment_id: Uuid
    user_id: Uuid
    booking_id: Uuid | None
    status: Literal["refunded"]
    amount_cents: AmountCents
    currency: Literal["ARS"]
    provider_payment_id: Annotated[str, Field(min_length=1)]


class PaymentRefundedEvent(BaseModel):
    """
    `payment.refunded`: An approved payment was refunded: `approved` -> `refunded`.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    event_id: Uuid
    event_type: Literal["payment.refunded"]
    occurred_at: Timestamp
    schema_version: Literal[1]
    payload: Annotated[PaymentRefundedPayload, Field(title="PaymentRefundedPayload")]


class SettlementReadyPayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    settlement_id: Uuid
    club_id: Uuid
    period: Annotated[str, Field(pattern="^[0-9]{4}-(0[1-9]|1[0-2])$")]
    """
    Settled month, `YYYY-MM`.
    """
    status: Literal["draft"]
    gross_cents: AmountCents
    platform_fee_cents: AmountCents
    net_cents: AmountCents


class SettlementReadyEvent(BaseModel):
    """
    `settlement.ready`: The monthly settlement of a club was drafted (1st of the month) and awaits approval: status `draft`.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    event_id: Uuid
    event_type: Literal["settlement.ready"]
    occurred_at: Timestamp
    schema_version: Literal[1]
    payload: Annotated[SettlementReadyPayload, Field(title="SettlementReadyPayload")]


class EventType(StrEnum):
    """
    Name of a domain event (section 11).
    """

    booking_cancelled = "booking.cancelled"
    booking_confirmed = "booking.confirmed"
    clip_created = "clip.created"
    device_offline = "device.offline"
    match_processed = "match.processed"
    match_published = "match.published"
    match_recorded = "match.recorded"
    match_recording_started = "match.recording_started"
    match_score_corrected = "match.score_corrected"
    payment_approved = "payment.approved"
    payment_refunded = "payment.refunded"
    settlement_ready = "settlement.ready"


class DomainEvent(
    RootModel[
        BookingCancelledEvent
        | BookingConfirmedEvent
        | ClipCreatedEvent
        | DeviceOfflineEvent
        | MatchProcessedEvent
        | MatchPublishedEvent
        | MatchRecordedEvent
        | MatchRecordingStartedEvent
        | MatchScoreCorrectedEvent
        | PaymentApprovedEvent
        | PaymentRefundedEvent
        | SettlementReadyEvent
    ]
):
    root: Annotated[
        BookingCancelledEvent
        | BookingConfirmedEvent
        | ClipCreatedEvent
        | DeviceOfflineEvent
        | MatchProcessedEvent
        | MatchPublishedEvent
        | MatchRecordedEvent
        | MatchRecordingStartedEvent
        | MatchScoreCorrectedEvent
        | PaymentApprovedEvent
        | PaymentRefundedEvent
        | SettlementReadyEvent,
        Field(discriminator="event_type"),
    ]
    """
    Any domain event, discriminated by `event_type`.
    """
