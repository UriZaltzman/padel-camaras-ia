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


class MatchPosition(IntEnum):
    """
    One of the four tracked players of a match (the 4 tracks of section 5).
    """

    integer_1 = 1
    integer_2 = 2
    integer_3 = 3
    integer_4 = 4


class Team1(IntEnum):
    """
    Team 1 or 2, fixed by the side of the net at the first serve.
    """

    integer_1 = 1
    integer_2 = 2


class CourtZone(StrEnum):
    """
    One of the 9 zones of each half (section 7): width `left`, `center`, `right` by depth
    `net` (0 to 3 m from the net), `mid` (3 to 6.95 m) and `back` (6.95 to 10 m).

    """

    net_left = "net_left"
    net_center = "net_center"
    net_right = "net_right"
    mid_left = "mid_left"
    mid_center = "mid_center"
    mid_right = "mid_right"
    back_left = "back_left"
    back_center = "back_center"
    back_right = "back_right"


class ShotType(StrEnum):
    """
    Shot type from the classifier (section 5, step 9). `unknown` when confidence is under
    0.6; it does not count in per-type stats.

    """

    serve = "serve"
    forehand = "forehand"
    backhand = "backhand"
    forehand_volley = "forehand_volley"
    backhand_volley = "backhand_volley"
    bandeja = "bandeja"
    vibora = "vibora"
    smash = "smash"
    lob = "lob"
    wall_exit = "wall_exit"
    unknown = "unknown"


class ShotTypeStats(BaseModel):
    """
    Count and outcome of one shot type for a player.
    """

    shot_type: ShotType
    count: Annotated[int, Field(ge=0)]
    winners: Annotated[int, Field(ge=0)]
    errors: Annotated[int, Field(ge=0)]


class ZoneCount(BaseModel):
    """
    Points lost whose decisive event was in a zone (section 7, "dónde se fue el partido").
    """

    zone: CourtZone
    points: Annotated[int, Field(ge=0)]


class PlayerMatchStats(BaseModel):
    """
    One player's stats for one match (`match_stats`), computed with fixed, versioned formulas
    (section 7). Percentages are 0 to 100. `max_ball_speed_kmh` is an estimate and is `null`
    without 3D ball positions.

    """

    formula_version: Annotated[str, Field(examples=["1.0.0"])]
    points_won: Annotated[int, Field(ge=0)]
    winners: Annotated[int, Field(ge=0)]
    forced_errors: Annotated[int, Field(ge=0)]
    unforced_errors: Annotated[int, Field(ge=0)]
    net_time_pct: Annotated[float, Field(ge=0.0, le=100.0)]
    net_approaches: Annotated[int, Field(ge=0)]
    distance_m: Annotated[float, Field(ge=0.0)]
    serve_points_won_pct: Annotated[float | None, Field(ge=0.0, le=100.0)]
    first_serve_in_pct: Annotated[float | None, Field(ge=0.0, le=100.0)]
    max_ball_speed_kmh: Annotated[float | None, Field(ge=0.0)]
    shots_by_type: list[ShotTypeStats]
    lost_points_by_zone: list[ZoneCount]


class MatchPlayerUser(BaseModel):
    """
    Public view of a player inside a match they share with the caller.
    """

    id: Uuid
    display_name: str
    photo_url: AnyUrl | None
    """
    Profile photo (not a video).
    """


class PointEndReason(StrEnum):
    """
    Rule of section 6 that closed the point.
    """

    double_fault = "double_fault"
    own_floor_before_net = "own_floor_before_net"
    net = "net"
    rival_wall_before_floor = "rival_wall_before_floor"
    double_bounce = "double_bounce"
    out_after_bounce = "out_after_bounce"
    ball_lost = "ball_lost"


class PointToReview(BaseModel):
    """
    A point with confidence under 0.7 (section 6, layer 2). The app shows its clip so the
    players confirm who won it.

    """

    id: Uuid
    number: Annotated[int, Field(ge=1)]
    set: Annotated[int, Field(ge=1)]
    game: Annotated[int, Field(ge=1)]
    winner_team: Team1
    end_reason: PointEndReason
    confidence: Annotated[float, Field(ge=0.0, le=1.0)]
    clip_media_id: Uuid | None


class Insight(BaseModel):
    """
    One sentence about the caller's match (section 7), written from a computed fact, with a
    tip for the next match. Text is `es-AR`, produced by the insights pipeline.

    """

    id: Uuid
    kind: Annotated[str, Field(examples=["net_uncovered"])]
    text: Annotated[str, Field(max_length=200)]
    tip: str | None
    order: Annotated[int, Field(ge=1)]


class MediaKind(StrEnum):
    full = "full"
    clip = "clip"
    reel = "reel"
    thumbnail = "thumbnail"


class MediaStatus(StrEnum):
    """
    `processing` while it is cut, encoded or uploaded; `ready` when a signed link can be
    issued; `in_club` when the full video stayed in the club (ask with
    `POST /media/{id}/download`); `expired` after it was deleted (full videos after 30 days).

    """

    processing = "processing"
    in_club = "in_club"
    ready = "ready"
    expired = "expired"


class MediaAsset(BaseModel):
    """
    A video, clip, reel or thumbnail, by id. Never carries its storage path or URL.
    """

    id: Uuid
    kind: MediaKind
    status: MediaStatus
    duration_ms: Annotated[int | None, Field(ge=0)]
    """
    `null` for thumbnails.
    """
    expires_at: Timestamp | None
    """
    When the media is deleted (full video 30 days after the match), or `null`.
    """


class ClipSource(StrEnum):
    """
    `app` (tap or cut in the app), `button` (court button) or `auto` (highlight).
    """

    app = "app"
    button = "button"
    auto = "auto"


class Clip(BaseModel):
    id: Uuid
    match_id: Uuid
    source: ClipSource
    start_ms: Annotated[int, Field(ge=0)]
    """
    Offset from the start of the match video.
    """
    end_ms: Annotated[int, Field(ge=0)]
    highlight_score: Annotated[float | None, Field(ge=0.0, le=1.0)]
    """
    Automatic highlight score (section 7); `null` for app and button clips.
    """
    created_by_user_id: Uuid | None
    """
    `null` for button clips and automatic highlights.
    """
    media: MediaAsset
    thumbnail_media_id: Uuid | None
    created_at: Timestamp


class ClipCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    start_ms: Annotated[int, Field(ge=0)]
    end_ms: Annotated[int, Field(ge=1)]
    """
    After `start_ms`, at most 60 000 ms later.
    """


class ClaimPlayerRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    position: MatchPosition


class ScoreCorrectionFinalScore(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Literal["final_score"]
    sets: Annotated[list[SetScore], Field(max_length=3, min_length=1)]


class ScoreCorrectionPointWinner(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Literal["point_winner"]
    point_id: Uuid
    winner_team: Team1


class ScoreCorrectionRequest(RootModel[ScoreCorrectionFinalScore | ScoreCorrectionPointWinner]):
    root: Annotated[
        ScoreCorrectionFinalScore | ScoreCorrectionPointWinner, Field(discriminator="type")
    ]


class Type2(StrEnum):
    final_score = "final_score"
    point_winner = "point_winner"


class ScoreCorrection(BaseModel):
    id: Uuid
    match_id: Uuid
    type: Type2
    match_status: MatchStatus
    created_at: Timestamp


class SignedMediaUrl(BaseModel):
    """
    A signed, temporary link. Never store it; ask again when it expires.
    """

    media_id: Uuid
    url: AnyUrl
    """
    Signed storage URL, valid until `expires_at` (at most 1 hour).
    """
    expires_at: Timestamp
    content_type: Annotated[str, Field(examples=["video/mp4", "image/jpeg"])]


class Status1(StrEnum):
    ready = "ready"
    preparing = "preparing"


class MediaDownload(BaseModel):
    media_id: Uuid
    status: Status1
    url: AnyUrl | None
    """
    Signed download link valid at most 1 hour; `null` while `preparing`.
    """
    expires_at: Timestamp | None


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


class Type3(StrEnum):
    none = "none"


class DepositNone(BaseModel):
    """
    No deposit; the booking is confirmed right away.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    type: Literal["none"]


class Type4(StrEnum):
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


class Type5(StrEnum):
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


class Type6(StrEnum):
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
    type: Type6
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


class MatchPlayer(BaseModel):
    """
    One of the four tracked players. `user` is `null` until someone claims the position.
    `stats` is `null` for club staff and owner, and before the match is published.

    """

    position: MatchPosition
    team: Team1
    user: MatchPlayerUser | None
    confirmed: bool
    """
    True when the user confirmed the position ("este soy yo").
    """
    suggested: bool | None = None
    """
    True when this position is suggested to the caller because they scanned the court QR
    and were the closest player to the camera at that moment.

    """
    thumbnail_media_id: Uuid | None
    """
    Thumbnail used to pick "este soy yo". Fetch it with `GET /media/{id}/url`.
    """
    stats: PlayerMatchStats | None


class ClipPage(Page):
    items: list[Clip]


class MatchDetail(BaseModel):
    """
    A match seen by the caller. See `GET /matches/{id}` for what each role gets.
    """

    id: Uuid
    type: Type
    status: MatchStatus
    starts_at: Timestamp
    ends_at: Timestamp
    club: EntityRef
    court: EntityRef
    booking_id: Uuid | None
    """
    `null` for a recording started by hand from the club panel.
    """
    golden_point: bool
    """
    True plays golden point at deuce; false plays advantage.
    """
    sets: list[SetScore]
    """
    Score per set; empty until published.
    """
    winner_team: Team1 | None
    players: Annotated[list[MatchPlayer], Field(max_length=4)]
    """
    The four positions; empty until published.
    """
    points_to_review: list[PointToReview]
    """
    Points under 0.7 confidence, for the players to confirm. Empty for staff.
    """
    insights: list[Insight] | None
    """
    The caller's 3 insights; `null` for staff and owner or when not a player.
    """
    full_video: MediaAsset | None
    reel: MediaAsset | None
    """
    The caller's vertical reel, or `null` until generated.
    """
    published_at: Timestamp | None


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
