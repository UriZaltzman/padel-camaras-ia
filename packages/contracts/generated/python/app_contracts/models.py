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


class ThirdSet(StrEnum):
    """
    A normal set with tie-break at 6-6, or a super tie-break to 10.
    """

    set = "set"
    super_tiebreak = "super_tiebreak"


class ScoringRules(BaseModel):
    """
    How the match is scored (section 6), from the club settings at booking time.
    """

    golden_point: bool
    """
    True plays golden point at 40-40; false plays advantage.
    """
    third_set: ThirdSet
    """
    A normal set with tie-break at 6-6, or a super tie-break to 10.
    """


class MatchType(StrEnum):
    match = "match"
    lesson = "lesson"


class DeviceScheduleItem(BaseModel):
    match_id: Uuid
    booking_id: Uuid | None
    """
    `null` for a recording started by hand from the panel.
    """
    court_id: Uuid
    match_type: MatchType
    starts_at: Timestamp
    ends_at: Timestamp
    record_from: Timestamp
    record_until: Timestamp
    no_record: bool
    scoring: ScoringRules
    updated_at: Timestamp


class DeviceSchedule(BaseModel):
    club_id: Uuid
    generated_at: Timestamp
    valid_until: Timestamp
    """
    End of the 48-hour window.
    """
    items: list[DeviceScheduleItem]
    """
    Ordered by `record_from`. A cancelled turn disappears from the list.
    """


class DeviceCameraHealth(BaseModel):
    camera_id: Uuid
    online: bool
    fps: Annotated[float | None, Field(ge=0.0)]
    recording: bool


class UploadQueue(BaseModel):
    items: Annotated[int, Field(ge=0)]
    bytes: Annotated[int, Field(ge=0)]
    eta_minutes: Annotated[int, Field(ge=0)]


class DeviceHeartbeat(BaseModel):
    sent_at: Timestamp
    software_version: str
    uptime_seconds: Annotated[int, Field(ge=0)]
    disk_free_bytes: Annotated[int, Field(ge=0)]
    disk_total_bytes: Annotated[int, Field(ge=1)]
    gpu_temp_c: float | None
    cpu_temp_c: float | None = None
    cameras: list[DeviceCameraHealth]
    upload_queue: UploadQueue
    processing_backlog_minutes: Annotated[int, Field(ge=0)]
    """
    Local analysis backlog. Over 6 hours the oldest matches go to the cloud GPU.
    """


class DeviceHeartbeatAck(BaseModel):
    server_time: Timestamp
    desired_software_version: str
    """
    Version the `updater` installs between 4 and 6 a.m.
    """


class CourtEnd(StrEnum):
    """
    End of the court (camera end, or the side a team starts on).
    """

    A = "A"
    B = "B"


class CourtPosition(BaseModel):
    """
    Position in meters (see the format note above). `z` is `null` without 3D (the ball is
    triangulated only when both cameras see it). Values outside the court (lobs, exits,
    players behind the glass) are allowed within the 1.5 m mask and beyond for the ball.

    """

    x: Annotated[float, Field(ge=-5.0, le=15.0)]
    y: Annotated[float, Field(ge=-5.0, le=25.0)]
    z: Annotated[float | None, Field(ge=0.0)] = None


class PipelinePosition(IntEnum):
    """
    One of the 4 tracks (section 5, step 3).
    """

    integer_1 = 1
    integer_2 = 2
    integer_3 = 3
    integer_4 = 4


class PipelineTeam(IntEnum):
    integer_1 = 1
    integer_2 = 2


class PipelineShotType(StrEnum):
    """
    Section 5, step 9. `unknown` under 0.6 confidence.
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


class BounceSurface(StrEnum):
    """
    Section 5, step 8.
    """

    floor = "floor"
    back_glass = "back_glass"
    side_glass = "side_glass"
    fence = "fence"
    net = "net"


class PipelinePointEndReason(StrEnum):
    """
    Rule of section 6 that closed the point, in evaluation order.
    """

    double_fault = "double_fault"
    own_floor_before_net = "own_floor_before_net"
    net = "net"
    rival_wall_before_floor = "rival_wall_before_floor"
    double_bounce = "double_bounce"
    out_after_bounce = "out_after_bounce"
    ball_lost = "ball_lost"


class ResultPlayer(BaseModel):
    position: PipelinePosition
    team: PipelineTeam
    initial_side: CourtEnd
    thumbnail_media_id: Uuid | None
    """
    Thumbnail for "este soy yo", from `POST /device/uploads`.
    """
    track_coverage_pct: Annotated[float, Field(ge=0.0, le=100.0)]
    """
    Share of rally frames where this track was seen.
    """


class Kind(StrEnum):
    shot = "shot"
    bounce = "bounce"


class ResultEventRef(BaseModel):
    kind: Kind
    index: Annotated[int, Field(ge=0)]
    """
    Index in `shots` or `bounces`.
    """


class ResultPoint(BaseModel):
    number: Annotated[int, Field(ge=1)]
    """
    1-based, consecutive over the match.
    """
    set: Annotated[int, Field(ge=1, le=3)]
    game: Annotated[int, Field(ge=1)]
    """
    1-based within the set; the tie-break is game 13.
    """
    server_position: PipelinePosition
    serve_faults: Annotated[int, Field(ge=0, le=2)]
    winner_team: PipelineTeam
    end_reason: PipelinePointEndReason
    deciding_event: ResultEventRef | None
    """
    The event that closed the point; `null` for `ball_lost`.
    """
    confidence: Annotated[float, Field(ge=0.0, le=1.0)]
    """
    Product of the confidence of the deciding events (section 6, layer 2).
    """
    needs_review: bool
    """
    Confidence under the review threshold of `ml/config/thresholds.yaml` (0.7).
    """
    start_ms: Annotated[int, Field(ge=0)]
    end_ms: Annotated[int, Field(ge=0)]


class ResultShot(BaseModel):
    point_number: Annotated[int, Field(ge=1)]
    t_ms: Annotated[int, Field(ge=0)]
    player_position: PipelinePosition
    shot_type: PipelineShotType
    shot_type_confidence: Annotated[float, Field(ge=0.0, le=1.0)]
    player_at: CourtPosition
    """
    Player's foot point at contact.
    """
    ball_at: CourtPosition
    """
    Ball at contact.
    """
    speed_kmh: Annotated[float | None, Field(ge=0.0)]
    """
    Estimated, only with 3D positions.
    """
    after_bounce: bool
    off_wall: bool
    """
    The ball came off a wall before the shot (salida de pared).
    """
    camera: CourtEnd


class ResultBounce(BaseModel):
    point_number: Annotated[int, Field(ge=1)]
    t_ms: Annotated[int, Field(ge=0)]
    surface: BounceSurface
    ball_at: CourtPosition
    confidence: Annotated[float, Field(ge=0.0, le=1.0)]


class Layer(StrEnum):
    serve_coherence = "serve_coherence"


class ResultCorrection(BaseModel):
    """
    A point changed by serve coherence (section 6, layer 1).
    """

    layer: Layer
    point_number: Annotated[int, Field(ge=1)]
    from_winner_team: PipelineTeam
    to_winner_team: PipelineTeam


class ResultStats(BaseModel):
    """
    Stats of one position computed on the device with the versioned formulas of section 7.
    `values` keys are the metric names of `ml` (for example `points_won`, `winners`,
    `net_time_pct`, `distance_m`); the cloud recomputes them after a score correction.

    """

    position: PipelinePosition
    formula_version: str
    values: dict[str, float]


class ResultHighlight(BaseModel):
    point_number: Annotated[int, Field(ge=1)]
    score: Annotated[float, Field(ge=0.0, le=1.0)]
    """
    Highlight score of section 7.
    """
    start_ms: Annotated[int, Field(ge=0)]
    end_ms: Annotated[int, Field(ge=0)]
    clip_media_id: Uuid | None


class ResultCalibration(BaseModel):
    camera: CourtEnd
    calibration_id: Uuid
    reprojection_error_cm: Annotated[float, Field(ge=0.0)]


class ResultModelVersions(BaseModel):
    player_detector: str
    ball_tracker: str
    pose: str
    shot_classifier: str
    reid: str


class Status(StrEnum):
    succeeded = "succeeded"
    failed = "failed"


class Failure(BaseModel):
    stage: Annotated[str, Field(examples=["ball_tracking"])]
    code: Annotated[str, Field(pattern="^[A-Z][A-Z0-9_]*$")]


class ProcessedOn(StrEnum):
    club = "club"
    cloud = "cloud"


class Video(BaseModel):
    duration_ms: Annotated[int, Field(ge=0)]
    fps: Annotated[float, Field(gt=0.0)]
    camera_offset_ms: int
    """
    Fine offset of camera B relative to A, from ball trajectory alignment.
    """


class MatchResultsAck(BaseModel):
    match_id: Uuid
    run_id: Uuid
    match_status: MatchStatus


class DeviceUploadKind(StrEnum):
    full = "full"
    clip = "clip"
    reel = "reel"
    thumbnail = "thumbnail"


class ContentType(StrEnum):
    video_mp4 = "video/mp4"
    image_jpeg = "image/jpeg"


class Source(StrEnum):
    app = "app"
    button = "button"
    auto = "auto"


class Clip(BaseModel):
    """
    Required for `kind: clip`.
    """

    start_ms: Annotated[int, Field(ge=0)]
    end_ms: Annotated[int, Field(ge=0)]
    source: Source
    requested_by_user_id: Uuid | None = None
    """
    The player who tapped in the app, from the court channel.
    """


class DeviceUploadRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    match_id: Uuid
    kind: DeviceUploadKind
    content_type: ContentType
    size_bytes: Annotated[int, Field(ge=1)]
    sha256: Annotated[str, Field(pattern="^[0-9a-f]{64}$")]
    duration_ms: Annotated[int | None, Field(ge=0)] = None
    clip: Clip | None = None
    """
    Required for `kind: clip`.
    """
    upload_id: Uuid | None = None
    """
    Resume an existing upload and get fresh part links.
    """


class DeviceUploadPart(BaseModel):
    number: Annotated[int, Field(ge=1)]
    url: AnyUrl
    """
    Signed `PUT` link for this part, valid 1 hour.
    """


class DeviceUpload(BaseModel):
    upload_id: Uuid
    media_id: Uuid
    part_size_bytes: Annotated[int, Field(ge=5242880)]
    parts: list[DeviceUploadPart]
    """
    Links for the parts not uploaded yet.
    """
    expires_at: Timestamp


class Part(BaseModel):
    number: Annotated[int, Field(ge=1)]
    etag: str


class DeviceUploadComplete(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    parts: Annotated[list[Part], Field(min_length=1)]


class Status1(StrEnum):
    ready = "ready"


class DeviceUploadDone(BaseModel):
    upload_id: Uuid
    media_id: Uuid
    status: Status1


class Status2(StrEnum):
    ok = "ok"


class HealthStatus(BaseModel):
    """
    Liveness result.
    """

    status: Status2


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


class Score(BaseModel):
    sets: list[SetScore]
    winner_team: PipelineTeam | None
    completed: bool
    """
    False when the turn ended before the match did.
    """


class MatchResults(BaseModel):
    """
    Output of the club pipeline for one match (schema version 1). `points`, `shots` and
    `bounces` are each ordered by time; shots and bounces link to their point by
    `point_number`. On `status: failed` only the run metadata and `failure` are sent.

    """

    schema_version: Literal[1]
    run_id: Uuid
    match_id: Uuid
    status: Status
    failure: Failure | None = None
    processed_on: ProcessedOn
    pipeline_version: str
    model_versions: ResultModelVersions
    thresholds_sha256: Annotated[str, Field(pattern="^[0-9a-f]{64}$")]
    """
    Hash of `ml/config/thresholds.yaml` used in the run.
    """
    started_at: Timestamp
    finished_at: Timestamp
    video: Video
    calibrations: list[ResultCalibration]
    scoring: ScoringRules
    players: Annotated[list[ResultPlayer], Field(max_length=4)]
    points: list[ResultPoint]
    shots: list[ResultShot]
    bounces: list[ResultBounce]
    score: Score
    corrections: list[ResultCorrection]
    stats: list[ResultStats]
    highlights: Annotated[list[ResultHighlight], Field(max_length=5)]


class AuthSession(TokenPair):
    user: User
    is_new_user: bool
    """
    True when this request created the account.
    """


class MatchSummaryPage(Page):
    items: list[MatchSummary]


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
