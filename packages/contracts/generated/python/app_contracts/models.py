# Generated from packages/contracts/openapi/openapi.yaml by `pnpm contracts:generate`.
# Do not edit: change the contract and regenerate.

from __future__ import annotations

from datetime import date
from enum import Enum, StrEnum
from typing import Annotated, Any
from uuid import UUID

from pydantic import AnyUrl, AwareDatetime, BaseModel, ConfigDict, Field, RootModel


class Uuid(RootModel[UUID]):
    root: Annotated[UUID, Field(examples=["01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b"])]
    """
    UUID v7.
    """


class Timestamp(RootModel[AwareDatetime]):
    root: Annotated[AwareDatetime, Field(examples=["2026-10-17T21:30:00Z"])]
    """
    RFC 3339 timestamp in UTC.
    """


class AmountCents(RootModel[int]):
    root: Annotated[int, Field(examples=[1500000], ge=0)]
    """
    Amount in ARS cents. Never decimals.
    """


class MatchStatus(StrEnum):
    """
    Status of a match (`matches.status`). Recording and analysis move it forward; a score
    correction sends it to `needs_review`, and after 30 days the full video is deleted and it
    is `archived`.

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
    Status of a booking (`bookings.status`). A new booking is `held` for 10 minutes while the
    deposit is paid; if it is not paid in time it is `expired` and the slot is released.

    """

    held = "held"
    confirmed = "confirmed"
    completed = "completed"
    cancelled = "cancelled"
    no_show = "no_show"
    expired = "expired"


class ProcessingJobStatus(StrEnum):
    """
    Status of an analysis job (`processing_jobs.status`). The job also stores its pipeline
    stage, so it resumes from there after a power cut.

    """

    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


class PaymentStatus(StrEnum):
    """
    Status of a payment (`payments.status`). Only the Mercado Pago webhook changes it, never
    the app.

    """

    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    refunded = "refunded"


class SettlementStatus(StrEnum):
    """
    Status of a monthly settlement (`settlements.status`). It is drafted on the 1st of each
    month, approved by the team, invoiced and then paid.

    """

    draft = "draft"
    approved = "approved"
    invoiced = "invoiced"
    paid = "paid"


class Status(StrEnum):
    ok = "ok"


class HealthStatus(BaseModel):
    """
    Liveness result.
    """

    status: Status


class PhoneNumber(RootModel[str]):
    root: Annotated[str, Field(examples=["+5491155550123"], pattern="^\\+[1-9][0-9]{7,14}$")]
    """
    Phone in E.164 format, with country code (WhatsApp number).
    """


class SignUpConsent(BaseModel):
    """
    Acceptance of the terms and the privacy policy (Ley 25.326), required to create an
    account. Sending it means the user accepted the given versions; the server stores the
    versions and the time.

    """

    terms_version: Annotated[str, Field(max_length=32, min_length=1)]
    """
    Version of the terms the user saw, e.g. `2026-10-01`.
    """
    privacy_version: Annotated[str, Field(max_length=32, min_length=1)]
    """
    Version of the privacy policy the user saw.
    """


class OtpRequest(BaseModel):
    phone: PhoneNumber


class OtpChallenge(BaseModel):
    expires_in_seconds: Annotated[int, Field(ge=0)]
    """
    Seconds until the code expires (300).
    """
    resend_after_seconds: Annotated[int, Field(ge=0)]
    """
    Seconds before the app may ask for a new code.
    """


class OtpVerifyRequest(BaseModel):
    phone: PhoneNumber
    code: Annotated[str, Field(pattern="^[0-9]{6}$")]
    """
    The 6-digit code received by WhatsApp.
    """
    consent: SignUpConsent | None = None


class OAuthSignInRequest(BaseModel):
    id_token: Annotated[str, Field(max_length=8192, min_length=1)]
    """
    ID token issued by the provider to this app.
    """
    nonce: Annotated[str | None, Field(max_length=256, min_length=1)] = None
    """
    Raw nonce used when asking for the token, checked against its `nonce` claim.
    """
    consent: SignUpConsent | None = None


class AppleSignInRequest(OAuthSignInRequest):
    full_name: Annotated[str | None, Field(max_length=120, min_length=1)] = None
    """
    Name Apple sent on the first authorization only.
    """


class RefreshRequest(BaseModel):
    refresh_token: Annotated[str, Field(max_length=512, min_length=1)]


class TokenType(StrEnum):
    Bearer = "Bearer"


class TokenPair(BaseModel):
    access_token: str
    """
    JWT for the `Authorization` header. Valid for 15 minutes.
    """
    refresh_token: str
    """
    Opaque, single-use token valid for 30 days. Store it securely.
    """
    token_type: TokenType
    expires_in: Annotated[int, Field(ge=0)]
    """
    Seconds until the access token expires (900).
    """


class DeclaredCategory(StrEnum):
    """
    Self-declared Argentine padel category, from 8va (`8`) to 1ra (`1`).
    """

    field_1 = "1"
    field_2 = "2"
    field_3 = "3"
    field_4 = "4"
    field_5 = "5"
    field_6 = "6"
    field_7 = "7"
    field_8 = "8"


class DominantHand(StrEnum):
    right = "right"
    left = "left"


class PlayingSide(StrEnum):
    """
    Preferred side of the court. `drive` is the right side, `reves` the left.
    """

    drive = "drive"
    reves = "reves"
    both = "both"


class User(BaseModel):
    """
    The signed-in user's own profile. Only the owner sees phone, email and birth date.
    """

    id: Uuid
    display_name: Annotated[str, Field(max_length=80, min_length=1)]
    phone: str | None
    """
    Verified WhatsApp phone in E.164, or `null` if the user signed in only with Google or Apple.
    """
    email: Annotated[str | None, Field(max_length=254)]
    """
    Email from Google or Apple, or `null`. Plain string on purpose (no `format: email`), so
    the Python models do not need `email-validator`.

    """
    photo_url: AnyUrl | None
    declared_category: DeclaredCategory | None
    dominant_hand: DominantHand | None
    playing_side: PlayingSide | None
    birth_date: date | None
    """
    Used to apply the minors rule (no recording without a guardian's permission).
    """
    training_opt_out: bool
    """
    True when the user asked that their videos not be used to train the AI.
    """
    terms_version: str
    """
    Version of the terms the user accepted.
    """
    terms_accepted_at: Timestamp
    privacy_version: str
    """
    Version of the privacy policy the user accepted.
    """
    created_at: Timestamp


class UserUpdate(BaseModel):
    """
    Fields of `User` the owner may change. At least one is required.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    display_name: Annotated[str | None, Field(max_length=80, min_length=1)] = None
    photo_url: AnyUrl | None = None
    declared_category: DeclaredCategory | None = None
    dominant_hand: DominantHand | None = None
    playing_side: PlayingSide | None = None
    birth_date: date | None = None
    training_opt_out: bool | None = None


class AccountDeletion(BaseModel):
    deletion_scheduled_for: Timestamp


class EntityRef(BaseModel):
    """
    Id and display name of a related entity.
    """

    id: Uuid
    name: str


class SetScore(BaseModel):
    """
    Games won by each team in one set.
    """

    team_1: Annotated[int, Field(ge=0)]
    team_2: Annotated[int, Field(ge=0)]


class Type(StrEnum):
    match = "match"
    lesson = "lesson"


class Team(Enum):
    """
    The user's team, or `null` while not assigned.
    """

    int_1 = 1
    int_2 = 2
    NoneType_None = None


class MatchSummary(BaseModel):
    """
    A match in the user's list, seen from that user's side.
    """

    id: Uuid
    type: Type
    status: MatchStatus
    starts_at: Timestamp
    ends_at: Timestamp
    club: EntityRef
    court: EntityRef
    team: Team | None
    """
    The user's team, or `null` while not assigned.
    """
    won: bool | None
    """
    Whether the user's team won, or `null` until the match is published.
    """
    sets: list[SetScore]
    """
    Final score per set; empty until the match is published.
    """


class UserStats(BaseModel):
    """
    Aggregate stats over the user's published matches.
    """

    matches_played: Annotated[int, Field(ge=0)]
    matches_won: Annotated[int, Field(ge=0)]
    sets_won: Annotated[int, Field(ge=0)]
    sets_lost: Annotated[int, Field(ge=0)]
    points_won: Annotated[int, Field(ge=0)]
    points_played: Annotated[int, Field(ge=0)]
    rating: float | None
    """
    Current level estimate, or `null` until enough matches are published.
    """
    last_match_at: Timestamp | None


class Page(BaseModel):
    """
    Base of every paginated response. A list operation combines it with `allOf` and adds an
    `items` array of its own type.

    """

    next_cursor: str | None
    """
    Cursor for the next page, or `null` on the last page.
    """


class ValidationIssue(BaseModel):
    """
    One invalid field, used in `details.issues` of `VALIDATION_FAILED`.
    """

    path: str
    """
    JSON pointer or parameter name of the invalid value, e.g. `/players/0/phone`.
    """
    rule: str
    """
    Machine-readable rule that failed, e.g. `required`, `max`, `format`.
    """


class ErrorCode(StrEnum):
    """
    Stable error codes. The catalog in `x-error-catalog` gives the HTTP status, the meaning
    and the `details` shape of each one. Codes are only added, never renamed or reused.

    """

    VALIDATION_FAILED = "VALIDATION_FAILED"
    INVALID_CURSOR = "INVALID_CURSOR"
    UNAUTHENTICATED = "UNAUTHENTICATED"
    ACCESS_TOKEN_EXPIRED = "ACCESS_TOKEN_EXPIRED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    INVALID_STATE_TRANSITION = "INVALID_STATE_TRANSITION"
    RATE_LIMITED = "RATE_LIMITED"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    OTP_INVALID = "OTP_INVALID"
    OTP_EXPIRED = "OTP_EXPIRED"
    OTP_ATTEMPTS_EXCEEDED = "OTP_ATTEMPTS_EXCEEDED"
    REFRESH_TOKEN_INVALID = "REFRESH_TOKEN_INVALID"
    TERMS_NOT_ACCEPTED = "TERMS_NOT_ACCEPTED"
    CLUB_FEATURE_DISABLED = "CLUB_FEATURE_DISABLED"
    CLUB_SERVICE_SUSPENDED = "CLUB_SERVICE_SUSPENDED"
    BOOKING_SLOT_TAKEN = "BOOKING_SLOT_TAKEN"
    BOOKING_SLOT_INVALID = "BOOKING_SLOT_INVALID"
    BOOKING_HOLD_EXPIRED = "BOOKING_HOLD_EXPIRED"
    BOOKING_FULL = "BOOKING_FULL"
    BOOKING_INVITE_INVALID = "BOOKING_INVITE_INVALID"
    MATCH_NOT_PUBLISHED = "MATCH_NOT_PUBLISHED"
    MATCH_PLAYER_SLOT_TAKEN = "MATCH_PLAYER_SLOT_TAKEN"
    MATCH_ALREADY_JOINED = "MATCH_ALREADY_JOINED"
    MEDIA_NOT_READY = "MEDIA_NOT_READY"
    MEDIA_EXPIRED = "MEDIA_EXPIRED"
    COACH_ACCESS_NOT_GRANTED = "COACH_ACCESS_NOT_GRANTED"
    PAYMENT_PROVIDER_ERROR = "PAYMENT_PROVIDER_ERROR"
    WEBHOOK_SIGNATURE_INVALID = "WEBHOOK_SIGNATURE_INVALID"
    RECORDING_NOT_ACTIVE = "RECORDING_NOT_ACTIVE"
    DEVICE_CERTIFICATE_INVALID = "DEVICE_CERTIFICATE_INVALID"
    DEVICE_CLUB_MISMATCH = "DEVICE_CLUB_MISMATCH"


class AuthSession(TokenPair):
    user: User
    is_new_user: bool
    """
    True when this request created the account.
    """


class MatchSummaryPage(Page):
    items: list[MatchSummary]


class Error(BaseModel):
    """
    Body of every 4xx and 5xx response.
    """

    code: ErrorCode
    message: str
    """
    Short text for the end user, in es-AR, from the API translation files.
    """
    details: dict[str, Any] | None = None
    """
    Optional machine-readable detail. Shape per code in the `ErrorCode` catalog.
    """
