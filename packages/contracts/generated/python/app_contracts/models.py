# Generated from packages/contracts/openapi/openapi.yaml by `pnpm contracts:generate`.
# Do not edit: change the contract and regenerate.

from __future__ import annotations

from datetime import date as date_aliased
from enum import Enum, IntEnum, StrEnum
from typing import Annotated, Any, Literal
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
    birth_date: date_aliased | None
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
    birth_date: date_aliased | None = None
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


class LessonKind(StrEnum):
    """
    `private` or `group` lesson, or a `school` (escuelita), which is "do not record" by
    default (section 12).

    """

    private = "private"
    group = "group"
    school = "school"


class LessonStudent(BaseModel):
    user: EntityRef
    accepted: bool
    payment_status: PaymentStatus | None
    """
    Status of this student's lesson payment, or `null` if not charged or not started.
    """


class PointItem(RootModel[float]):
    root: Annotated[float, Field(ge=0.0, le=1.0)]


class Point(RootModel[list[PointItem]]):
    root: Annotated[list[PointItem], Field(max_length=2, min_length=2)]


class DrawingStroke(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    color: Annotated[str, Field(pattern="^#[0-9A-Fa-f]{6}$")]
    width: Annotated[float, Field(gt=0.0, le=0.1)]
    """
    Stroke width as a fraction of the frame width.
    """
    points: Annotated[list[Point], Field(max_length=500, min_length=2)]
    """
    `[x, y]` pairs, each 0..1 relative to the video frame.
    """


class Drawing(BaseModel):
    """
    A drawing over one video frame.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    strokes: Annotated[list[DrawingStroke], Field(max_length=50)]


class LessonNoteCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    text: Annotated[str, Field(max_length=2000, min_length=1)]
    at_ms: Annotated[int | None, Field(ge=0)] = None
    """
    Moment of the lesson video the note refers to, or `null` for the whole lesson.
    """
    student_id: Uuid | None = None
    """
    The student the note is for, or `null` for all of them.
    """
    drawing: Drawing | None = None
    """
    Requires `at_ms`.
    """
    is_plan: bool | None = None
    """
    True marks the note as a plan item for the next lessons.
    """
    visible_to_students: bool | None = None
    """
    Defaults to true.
    """


class LessonNote(BaseModel):
    id: Uuid
    lesson_id: Uuid
    text: str
    at_ms: Annotated[int | None, Field(ge=0)]
    student_id: Uuid | None
    drawing: Drawing | None
    is_plan: bool
    visible_to_students: bool
    created_at: Timestamp


class CoachAccess(StrEnum):
    """
    What the student shares with the coach: `lessons_only` (the lessons this coach taught)
    or `matches_and_lessons` (also their matches and stats, section 12).

    """

    lessons_only = "lessons_only"
    matches_and_lessons = "matches_and_lessons"


class CoachStudent(BaseModel):
    user: EntityRef
    access: CoachAccess
    lessons_count: Annotated[int, Field(ge=0)]
    last_lesson_at: Timestamp | None
    pending_payment_cents: AmountCents


class PaymentConcept(StrEnum):
    """
    `payments.concept`. Players pay `deposit`, `player_extra` and `lesson` through checkout;
    `subscription` is the club's monthly fee, charged by a Mercado Pago subscription in our
    company's name (never through checkout).

    """

    deposit = "deposit"
    player_extra = "player_extra"
    lesson = "lesson"
    subscription = "subscription"


class CheckoutDeposit(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    concept: Literal["deposit"]
    booking_id: Uuid


class CheckoutPlayerExtra(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    concept: Literal["player_extra"]
    match_id: Uuid


class CheckoutLesson(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    concept: Literal["lesson"]
    lesson_id: Uuid


class CheckoutRequest(RootModel[CheckoutDeposit | CheckoutPlayerExtra | CheckoutLesson]):
    root: Annotated[
        CheckoutDeposit | CheckoutPlayerExtra | CheckoutLesson, Field(discriminator="concept")
    ]
    """
    What is being paid. The amount comes from the server, never from the client.
    """


class Payee(StrEnum):
    """
    Whose Mercado Pago account receives the money: the `club`, the `coach`, or
    `platform` when the club or coach has not connected an account yet (we transfer in
    the monthly settlement).

    """

    club = "club"
    coach = "coach"
    platform = "platform"


class Checkout(BaseModel):
    payment_id: Uuid
    concept: PaymentConcept
    status: PaymentStatus
    amount_cents: AmountCents
    marketplace_fee_cents: AmountCents
    payee: Payee
    """
    Whose Mercado Pago account receives the money: the `club`, the `coach`, or
    `platform` when the club or coach has not connected an account yet (we transfer in
    the monthly settlement).

    """
    checkout_url: AnyUrl
    """
    Mercado Pago checkout (`init_point`) to open in the browser or app.
    """
    expires_at: Timestamp | None
    """
    For deposits, the end of the 10-minute hold.
    """


class Data(BaseModel):
    id: str


class MercadoPagoNotification(BaseModel):
    """
    Body Mercado Pago sends (webhooks v1). Only `type` and `data.id` are used; amounts and
    status are always read back from Mercado Pago's API.

    """

    id: int | None = None
    live_mode: bool | None = None
    type: Annotated[str, Field(examples=["payment"])]
    date_created: str | None = None
    user_id: int | None = None
    api_version: str | None = None
    action: Annotated[str | None, Field(examples=["payment.created", "payment.updated"])] = None
    data: Data


class ClubPlan(StrEnum):
    """
    How the club got the camera kit: `loan` (comodato, we keep ownership) or `purchase`.
    Set by the contract with us; read-only for the club.

    """

    loan = "loan"
    purchase = "purchase"


class ClubSummary(BaseModel):
    """
    A club in the public list.
    """

    id: Uuid
    name: Annotated[str, Field(max_length=120, min_length=1)]
    address: Annotated[str, Field(max_length=200)]
    city: Annotated[str, Field(max_length=80)]
    logo_url: AnyUrl | None
    courts_count: Annotated[int, Field(ge=0)]


class CourtStatus(StrEnum):
    """
    `active` takes bookings; `maintenance` is temporarily closed (no new bookings);
    `inactive` is out of service.

    """

    active = "active"
    maintenance = "maintenance"
    inactive = "inactive"


class Weekday(StrEnum):
    mon = "mon"
    tue = "tue"
    wed = "wed"
    thu = "thu"
    fri = "fri"
    sat = "sat"
    sun = "sun"


class LocalTime(RootModel[str]):
    root: Annotated[
        str, Field(examples=["18:00"], pattern="^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$")
    ]
    """
    Local time `HH:MM` in the club's time zone. `24:00` is allowed as an end time and means
    midnight at the end of the day.

    """


class BookingDuration(IntEnum):
    """
    Allowed booking length in minutes.
    """

    integer_60 = 60
    integer_90 = 90
    integer_120 = 120


class DurationPrice(BaseModel):
    duration_minutes: BookingDuration
    amount_cents: AmountCents


class PriceBand(BaseModel):
    """
    Price of a booking that starts in `[starts_at, ends_at)`, for example peak hours from
    18:00 to 23:00. The bands of a rule must cover its opening hours without gaps or
    overlaps, and have a price for every allowed duration.

    """

    starts_at: LocalTime
    ends_at: LocalTime
    prices: Annotated[list[DurationPrice], Field(max_length=3, min_length=1)]


class StartIntervalMinutes(IntEnum):
    """
    Every how many minutes a booking may start (30 by default).
    """

    integer_15 = 15
    integer_30 = 30
    integer_60 = 60


class BookingRule(BaseModel):
    """
    Opening hours of a court on some weekdays (`booking_slots_rules`). A booking must start
    on a step of `start_interval_minutes` from `opens_at` and end by `closes_at`. Rules of
    one court must not overlap on the same day.

    """

    days: Annotated[list[Weekday], Field(max_length=7, min_length=1)]
    opens_at: LocalTime
    closes_at: LocalTime
    allowed_durations: Annotated[list[BookingDuration], Field(max_length=3, min_length=1)]
    start_interval_minutes: StartIntervalMinutes
    """
    Every how many minutes a booking may start (30 by default).
    """
    price_bands: Annotated[list[PriceBand], Field(max_length=12, min_length=1)]


class Type1(StrEnum):
    none = "none"


class DepositNone(BaseModel):
    """
    No deposit; the booking is confirmed right away.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    type: Literal["none"]


class Type2(StrEnum):
    percent = "percent"


class DepositPercent(BaseModel):
    """
    Deposit as a percent of the booking price, rounded down to whole cents.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    type: Literal["percent"]
    percent: Annotated[int, Field(ge=1, le=100)]


class Type3(StrEnum):
    fixed = "fixed"


class DepositFixed(BaseModel):
    """
    Fixed deposit amount in ARS cents, capped at the booking price.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    type: Literal["fixed"]
    amount_cents: Annotated[int, Field(ge=1)]


class Deposit(RootModel[DepositNone | DepositPercent | DepositFixed]):
    root: Annotated[DepositNone | DepositPercent | DepositFixed, Field(discriminator="type")]
    """
    Deposit asked to confirm a booking, paid with Mercado Pago (section 9).
    """


class CourtBookingSettings(BaseModel):
    """
    Booking rules, deposit and cancellation policy of one court.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    rules: Annotated[list[BookingRule], Field(max_length=14)]
    """
    Empty means the court takes no bookings from the app.
    """
    deposit: Deposit
    cancellation_refund_hours: Annotated[int, Field(ge=0, le=168)]
    """
    Cancelling at least this many hours before the start refunds the deposit (24 by
    default). Later cancellations and `no_show` keep it.

    """


class PlayerExtraSettings(BaseModel):
    """
    Per-match extra charged to each player to unlock the full analysis (`player_extra`
    payments). The money goes to the club's Mercado Pago account.

    """

    model_config = ConfigDict(
        extra="forbid",
    )
    enabled: bool
    """
    False means everything is free for players.
    """
    amount_cents: Annotated[int | None, Field(ge=1)]
    """
    Price per player and match in ARS cents. Required when `enabled` is true.
    """


class Type4(StrEnum):
    included = "included"
    coach_monthly = "coach_monthly"


class CoachPlan(BaseModel):
    """
    Who pays for the coach tools: `included` in the club's subscription, or
    `coach_monthly`, a monthly fee each coach pays.

    """

    model_config = ConfigDict(
        extra="forbid",
    )
    type: Type4
    monthly_fee_cents: Annotated[int | None, Field(ge=1)] = None
    """
    Monthly fee per coach in ARS cents. Required when `type` is `coach_monthly`.
    """


class ChargeSettings(BaseModel):
    """
    How the club charges players and coaches (section 10).
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    player_extra: PlayerExtraSettings
    coach_plan: CoachPlan
    lesson_payments_enabled: bool
    """
    True lets the club's coaches charge their lessons in the app (`lesson` payments).
    """


class CourtSettingsUpdate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    court_id: Uuid
    booking: CourtBookingSettings


class ClubSettingsUpdate(BaseModel):
    """
    Settings the owner may change. At least one field is required.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    charges: ChargeSettings | None = None
    courts: Annotated[list[CourtSettingsUpdate] | None, Field(max_length=50, min_length=1)] = None


class AvailabilitySlot(BaseModel):
    """
    A free start time for the requested duration.
    """

    starts_at: Timestamp
    ends_at: Timestamp
    amount_cents: AmountCents
    deposit_cents: AmountCents


class CourtAvailability(BaseModel):
    court_id: Uuid
    date: date_aliased
    """
    Local day asked for, in the club's time zone.
    """
    timezone: str
    """
    IANA time zone of the club.
    """
    duration_minutes: BookingDuration
    slots: list[AvailabilitySlot]


class GuardianRelationship(StrEnum):
    mother = "mother"
    father = "father"
    guardian = "guardian"


class GuardianConsent(BaseModel):
    """
    Permission of a parent or legal guardian to record a minor's turn (section 12). Sending
    it means the guardian accepted the given version of the consent text; the server stores
    who, the version and the time. Only the club's staff and the player see it.

    """

    model_config = ConfigDict(
        extra="forbid",
    )
    guardian_name: Annotated[str, Field(max_length=120, min_length=1)]
    guardian_phone: PhoneNumber
    relationship: GuardianRelationship
    consent_version: Annotated[str, Field(max_length=32, min_length=1)]
    """
    Version of the consent text the guardian accepted, e.g. `2026-10-01`.
    """


class Frequency(StrEnum):
    weekly = "weekly"


class WeeksAhead(IntEnum):
    """
    Weeks generated ahead, renewed every week (section 9).
    """

    integer_8 = 8


class BookingRecurrence(BaseModel):
    """
    Fixed weekly turn on the same weekday and local time, generated 8 weeks ahead.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    frequency: Frequency
    weeks_ahead: WeeksAhead
    """
    Weeks generated ahead, renewed every week (section 9).
    """


class BookingCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    court_id: Uuid
    starts_at: Timestamp
    duration_minutes: BookingDuration
    recurrence: BookingRecurrence | None = None
    no_record: bool | None = False
    """
    True marks the turn as "do not record" on purpose.
    """
    guardian_consent: GuardianConsent | None = None


class BookingSource(StrEnum):
    """
    Where the booking was made.
    """

    app = "app"
    panel = "panel"


class NoRecordReason(StrEnum):
    """
    Why the turn will not be recorded: `requested` by the booker, a `club_school` marked by
    the club, or a `minor_without_guardian` (section 12).

    """

    requested = "requested"
    club_school = "club_school"
    minor_without_guardian = "minor_without_guardian"


class BookingPlayer(BaseModel):
    """
    A position of the booking. Position 1 is who booked.
    """

    position: Annotated[int, Field(ge=1, le=4)]
    user: EntityRef | None
    """
    The player, or `null` while the position is free or the invite is pending.
    """
    accepted: bool
    guardian_consent_on_file: bool
    """
    True when a guardian permission is loaded for this player (minors only).
    """


class WeeksAhead1(IntEnum):
    integer_8 = 8


class BookingSeries(BaseModel):
    """
    The fixed weekly rule an occurrence belongs to.
    """

    id: Uuid
    weeks_ahead: WeeksAhead1
    skipped_starts: list[Timestamp]
    """
    Starts of the next weeks not generated because the slot was taken.
    """


class Booking(BaseModel):
    id: Uuid
    club_id: Uuid
    court_id: Uuid
    starts_at: Timestamp
    ends_at: Timestamp
    duration_minutes: BookingDuration
    status: BookingStatus
    hold_expires_at: Timestamp | None
    """
    When a `held` booking expires (10 minutes after creation); `null` otherwise.
    """
    price_cents: AmountCents
    deposit_cents: AmountCents
    deposit_paid_cents: AmountCents
    cancellation_refund_hours: Annotated[int, Field(ge=0, le=168)]
    """
    Court policy copied when the booking was created; later changes do not apply.
    """
    source: BookingSource
    players: Annotated[list[BookingPlayer], Field(max_length=4, min_length=1)]
    no_record: bool
    """
    True means the club device will not record this turn.
    """
    no_record_reason: NoRecordReason | None
    series: BookingSeries | None
    created_at: Timestamp


class BookingInviteRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    position: Annotated[int | None, Field(ge=2, le=4)] = None
    """
    Position to invite to. Omitted means the lowest free one.
    """


class BookingInvite(BaseModel):
    booking_id: Uuid
    position: Annotated[int, Field(ge=2, le=4)]
    token: Annotated[str, Field(max_length=128, min_length=8)]
    """
    Single-use invite token.
    """
    url: AnyUrl
    """
    Link to share by WhatsApp; opens the app or the web on the invite.
    """
    expires_at: Timestamp


class BookingAcceptRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    token: Annotated[str, Field(max_length=128, min_length=8)]
    guardian_consent: GuardianConsent | None = None


class BookingCancelScope(StrEnum):
    """
    `series` also cancels the later occurrences of a fixed weekly booking.
    """

    this = "this"
    series = "series"


class BookingCancelRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    scope: BookingCancelScope | None = None


class RefundStatus(StrEnum):
    """
    `none` when the deposit is kept or there was none; `pending` until Mercado Pago confirms
    the refund.

    """

    none = "none"
    pending = "pending"


class BookingCancellation(BaseModel):
    booking_id: Uuid
    status: BookingStatus
    cancelled_at: Timestamp
    refund_cents: AmountCents
    refund_status: RefundStatus
    cancelled_booking_ids: Annotated[list[Uuid], Field(min_length=1)]
    """
    Every booking cancelled by the request (more than one with `scope` `series`).
    """


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


class LessonCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    court_id: Uuid
    starts_at: Timestamp
    duration_minutes: BookingDuration
    kind: LessonKind
    student_ids: Annotated[list[Uuid] | None, Field(max_length=12)] = None
    """
    Students with an account. Others join with the invite link.
    """
    price_cents: Annotated[int | None, Field(ge=1)] = None
    """
    Price per student in ARS cents, or `null` if the lesson is not charged in the app.
    """
    record: bool | None = None
    """
    Record the lesson. Defaults to true, and to false for `school`. A minor without a
    guardian permission is never recorded.

    """
    focus: Annotated[str | None, Field(max_length=200)] = None
    """
    What the lesson works on, shown to the students.
    """


class Lesson(BaseModel):
    id: Uuid
    club: EntityRef
    court: EntityRef
    coach: EntityRef
    kind: LessonKind
    starts_at: Timestamp
    ends_at: Timestamp
    booking_id: Uuid
    booking_status: BookingStatus
    match_id: Uuid | None
    """
    The recorded lesson (`type: lesson`), once recording started.
    """
    students: list[LessonStudent]
    price_cents: Annotated[int | None, Field(ge=1)]
    no_record: bool
    no_record_reason: NoRecordReason | None
    focus: str | None
    notes_count: Annotated[int, Field(ge=0)]


class LessonPage(Page):
    items: list[Lesson]


class CoachStudentPage(Page):
    items: list[CoachStudent]


class ClubSummaryPage(Page):
    items: list[ClubSummary]


class Court(BaseModel):
    id: Uuid
    name: Annotated[str, Field(max_length=60, min_length=1)]
    covered: bool
    """
    True for an indoor (techada) court.
    """
    status: CourtStatus
    booking: CourtBookingSettings


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


class Club(BaseModel):
    """
    Public detail of a club with its courts and settings.
    """

    id: Uuid
    name: Annotated[str, Field(max_length=120, min_length=1)]
    address: Annotated[str, Field(max_length=200)]
    city: Annotated[str, Field(max_length=80)]
    timezone: Annotated[str, Field(examples=["America/Argentina/Buenos_Aires"])]
    """
    IANA time zone of the club. Booking rule hours are local times in this zone.
    """
    logo_url: AnyUrl | None
    sponsor_name: Annotated[str | None, Field(max_length=120)]
    plan: ClubPlan
    courts: list[Court]
    charges: ChargeSettings
