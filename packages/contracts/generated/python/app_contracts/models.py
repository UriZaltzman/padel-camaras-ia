# Generated from packages/contracts/openapi/openapi.yaml by `pnpm contracts:generate`.
# Do not edit: change the contract and regenerate.

from __future__ import annotations

from datetime import date as date_aliased
from enum import Enum, IntEnum, StrEnum
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import AnyUrl, AwareDatetime, BaseModel, ConfigDict, EmailStr, Field, RootModel


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


class Clip1(BaseModel):
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


class Status3(StrEnum):
    ready = "ready"
    preparing = "preparing"


class MediaDownload(BaseModel):
    media_id: Uuid
    status: Status3
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


class CourtLiveStatus(StrEnum):
    """
    `recording` (a turn is being recorded), `idle`, `camera_offline` (one or both cameras
    down) or `maintenance` (court not active).

    """

    recording = "recording"
    idle = "idle"
    camera_offline = "camera_offline"
    maintenance = "maintenance"


class CameraEnd(StrEnum):
    """
    End of the court where the camera is mounted (section 5).
    """

    A = "A"
    B = "B"


class CameraState(BaseModel):
    end: CameraEnd
    online: bool


class CourtLive(BaseModel):
    court: EntityRef
    status: CourtLiveStatus
    cameras: list[CameraState]
    current_match_id: Uuid | None
    current_until: Timestamp | None
    """
    Scheduled end of the current recording.
    """
    next_booking_at: Timestamp | None


class DeviceHealthSummary(BaseModel):
    """
    Last heartbeat of a club device (section 4, `health`).
    """

    device_id: Uuid
    online: bool
    """
    False when no heartbeat arrived in the last 3 minutes.
    """
    last_seen_at: Timestamp
    disk_free_pct: Annotated[float, Field(ge=0.0, le=100.0)]
    gpu_temp_c: float | None
    upload_queue_minutes: Annotated[int, Field(ge=0)]
    """
    Estimated minutes to empty the upload queue.
    """


class PricingTier(BaseModel):
    """
    Band of active players (distinct players with at least one recorded match in the club in
    the last 90 days) that sets the monthly subscription (decision of 21/10/2026, #253).
    Bands and prices live in the contract with the club; see `docs/pendientes.md`.

    """

    name: str
    min_active_players: Annotated[int, Field(ge=0)]
    max_active_players: Annotated[int | None, Field(ge=1)]
    """
    `null` for the top band.
    """


class ClubBillingSummary(BaseModel):
    """
    Owner only. Where the club stands on its subscription this month.
    """

    active_players_90d: Annotated[int, Field(ge=0)]
    tier: PricingTier
    subscription_cents: AmountCents
    debt_cents: AmountCents
    """
    Unpaid subscription; shown after 15 days, service cut at 30 (section 10).
    """


class ClubRevenueSummary(BaseModel):
    """
    Owner only. Money of the day, in ARS cents.
    """

    bookings_cents: AmountCents
    deposits_cents: AmountCents
    player_extras_cents: AmountCents


class ClubDashboard(BaseModel):
    club_id: Uuid
    date: date_aliased
    bookings_count: Annotated[int, Field(ge=0)]
    occupancy_pct: Annotated[float, Field(ge=0.0, le=100.0)]
    """
    Booked minutes over open minutes of every active court.
    """
    matches_published: Annotated[int, Field(ge=0)]
    matches_failed: Annotated[int, Field(ge=0)]
    courts: list[CourtLive]
    devices: list[DeviceHealthSummary]
    revenue: ClubRevenueSummary | None
    """
    `null` for staff.
    """
    billing: ClubBillingSummary | None
    """
    `null` for staff.
    """


class ClubBookingContact(BaseModel):
    """
    Who booked, so the front desk can reach them. No stats.
    """

    user_id: Uuid
    name: str | None
    phone: PhoneNumber | None
    account_pending: bool
    """
    True when the account was created from the panel and not activated yet.
    """


class ClubBooking(Booking):
    court_name: str
    booker: ClubBookingContact
    match_id: Uuid | None
    """
    The recorded match, once recording started.
    """


class Deposit1(StrEnum):
    """
    `none` or `paid_at_club` (cash or transfer at the desk). Defaults to `none`.
    """

    none = "none"
    paid_at_club = "paid_at_club"


class ClubBookingCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    court_id: Uuid
    starts_at: Timestamp
    duration_minutes: BookingDuration
    phone: PhoneNumber
    name: Annotated[str | None, Field(max_length=80)] = None
    """
    Name for a new pending account. Ignored if the phone has an account.
    """
    deposit: Deposit1 | None = None
    """
    `none` or `paid_at_club` (cash or transfer at the desk). Defaults to `none`.
    """
    recurrence: BookingRecurrence | None = None
    no_record: bool | None = None
    """
    Marks the turn "do not record" (for example an escuelita).
    """


class RecordingStop(BaseModel):
    court_id: Uuid
    match_id: Uuid
    match_status: MatchStatus
    stopped_at: Timestamp


class SettlementSubscription(BaseModel):
    active_players_90d: Annotated[int, Field(ge=0)]
    """
    Active players at the close of the period.
    """
    tier: PricingTier
    amount_cents: AmountCents


class Settlement(BaseModel):
    """
    Monthly summary of a club (section 10). All amounts in ARS cents.
    `net_payable_by_club_cents` = subscription + commissions minus `collected_by_platform_cents`
    (money we collected because the club had not connected its Mercado Pago account, which
    we owe the club), floored at 0; when we owe more than the club does, we transfer the
    difference to the club.

    """

    id: Uuid
    period: Annotated[str, Field(pattern="^\\d{4}-(0[1-9]|1[0-2])$")]
    """
    Month, `YYYY-MM`.
    """
    status: SettlementStatus
    subscription: SettlementSubscription
    player_payments_cents: AmountCents
    lesson_payments_cents: AmountCents
    deposits_cents: AmountCents
    commissions_cents: AmountCents
    collected_by_platform_cents: AmountCents
    net_payable_by_club_cents: AmountCents
    invoice_number: str | None
    """
    ARCA invoice number, once `invoiced`.
    """
    created_at: Timestamp


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
    TARIFF_VERSION_NOT_FOUND = "TARIFF_VERSION_NOT_FOUND"
    TARIFF_TIERS_INVALID = "TARIFF_TIERS_INVALID"
    CLUB_TAX_ID_TAKEN = "CLUB_TAX_ID_TAKEN"
    PAYMENT_ALREADY_RECORDED = "PAYMENT_ALREADY_RECORDED"
    SUPPORT_ACCESS_NOT_GRANTED = "SUPPORT_ACCESS_NOT_GRANTED"


class AdminClubStatus(StrEnum):
    """
    Commercial status of a club. `trial` and `active` are healthy, `overdue` keeps service
    while the subscription is unpaid (reminder at day 15), `suspended` cuts service (day 30 or
    by hand), `closed` is a club that left. Moves between states are done by the endpoints
    that name them; any other change returns `INVALID_STATE_TRANSITION`.

    """

    trial = "trial"
    active = "active"
    overdue = "overdue"
    suspended = "suspended"
    closed = "closed"


class AdminTierUsage(BaseModel):
    """
    Where a club stands against the active-player bands of its tariff version.
    """

    active_players_90d: Annotated[int, Field(ge=0)]
    tier: PricingTier
    next_tier_at: Annotated[int | None, Field(ge=1)]
    """
    Active players at which the club moves up a band; `null` in the top band.
    """


class AdminClubRow(BaseModel):
    """
    One club in the console list.
    """

    id: Uuid
    name: str
    city: str
    status: AdminClubStatus
    plan: ClubPlan
    tier: PricingTier
    balance_cents: int
    """
    Positive is what the club owes, negative is credit. ARS cents.
    """
    last_payment_at: Timestamp | None
    overdue_days: Annotated[int, Field(ge=0)]
    """
    Days since the oldest unpaid invoice was due; 0 when up to date.
    """


class AdminClubPage(Page):
    items: list[AdminClubRow]


class AdminLegalData(BaseModel):
    """
    Legal and contact data of the club (SA-03a).
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    legal_name: Annotated[str, Field(max_length=160, min_length=1)]
    tax_id: Annotated[str, Field(pattern="^\\d{11}$")]
    """
    CUIT, 11 digits without hyphens. Unique across clubs.
    """
    contact_name: Annotated[str, Field(max_length=120)]
    contact_phone: Annotated[str, Field(pattern="^\\+[1-9]\\d{7,14}$")]
    """
    E.164.
    """
    contact_email: EmailStr
    address: Annotated[str, Field(max_length=200)]
    """
    Street address; the API geocodes it.
    """
    city: Annotated[str, Field(max_length=80)]


class AdminClubUpdate(BaseModel):
    """
    Fields of a club the console may change. At least one is required.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    name: Annotated[str | None, Field(max_length=120, min_length=1)] = None
    legal: AdminLegalData | None = None
    plan: ClubPlan | None = None


class AdminClubStatusChange(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    reason: Annotated[str, Field(max_length=500, min_length=3)]
    """
    Why. Stored in `audit_log`.
    """


class Kind1(StrEnum):
    percent = "percent"
    fixed = "fixed"


class DepositModule(BaseModel):
    """
    Deposit (seña) charged when a player books.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    enabled: bool
    kind: Kind1
    percent: Annotated[int | None, Field(ge=1, le=100)]
    """
    Required when `kind` is `percent`.
    """
    amount_cents: AmountCents | None
    """
    Required when `kind` is `fixed`.
    """


class Mode(StrEnum):
    own = "own"
    generic = "generic"


class BrandingModule(BaseModel):
    """
    Club white-label look.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    mode: Mode
    logo_url: AnyUrl | None
    primary_color: Annotated[str | None, Field(pattern="^#[0-9A-Fa-f]{6}$")]
    secondary_color: Annotated[str | None, Field(pattern="^#[0-9A-Fa-f]{6}$")]


class AiVideoPayer(StrEnum):
    """
    Who pays for recording, analysis and video. `off` turns Smart Court off for the club.
    """

    off = "off"
    club_pays = "club_pays"
    player_pays = "player_pays"


class LessonMode(StrEnum):
    """
    Whether lessons are booked in the app or the coach is opened on WhatsApp.
    """

    app = "app"
    whatsapp = "whatsapp"


class AdminModules(BaseModel):
    """
    Feature flags of a club (SA-05).
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    deposit: DepositModule
    branding: BrandingModule
    lesson_mode: LessonMode
    """
    Whether lessons are booked in the app or the coach is opened on WhatsApp.
    """
    ai_video: AiVideoPayer
    tournaments: bool


class AdminClubModules(BaseModel):
    club_id: Uuid
    modules: AdminModules
    estimated_monthly_cents: AmountCents
    """
    Subscription tier plus the price of every enabled module.
    """
    tariff_version_id: Uuid


class AdminClubModulesUpdate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    modules: AdminModules


class AdminPaymentMethod(StrEnum):
    transfer = "transfer"
    cash = "cash"
    check = "check"
    card_in_person = "card_in_person"


class AdminOnboardingPayment(BaseModel):
    """
    The first payment, taken in person (SA-04 step 3).
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    amount_cents: AmountCents
    method: AdminPaymentMethod
    paid_on: date_aliased
    reference: Annotated[str | None, Field(max_length=120)] = None
    """
    Transfer number or receipt id.
    """
    receipt_media_id: Uuid | None = None
    """
    Uploaded proof of payment, if any.
    """


class Kind2(StrEnum):
    standard = "standard"
    panoramic = "panoramic"


class AdminOnboardingCourt(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    name: Annotated[str, Field(max_length=60)]
    kind: Kind2
    covered: bool
    price_cents_per_hour: AmountCents


class Owner(BaseModel):
    """
    Person invited as club owner.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    name: Annotated[str, Field(max_length=120)]
    phone: Annotated[str, Field(pattern="^\\+[1-9]\\d{7,14}$")]
    email: EmailStr | None = None


class AdminClubOnboarding(BaseModel):
    """
    Everything the on-site wizard collects (SA-04).
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    name: Annotated[str, Field(max_length=120, min_length=1)]
    legal: AdminLegalData
    owner: Owner
    """
    Person invited as club owner.
    """
    plan: ClubPlan
    tariff_version_id: Uuid
    modules: AdminModules
    payment: AdminOnboardingPayment
    courts: Annotated[list[AdminOnboardingCourt], Field(max_length=50, min_length=1)]


class AdminUserRef(BaseModel):
    id: Uuid
    name: str
    role: str
    """
    Club role (`owner`, `staff`, `coach`).
    """


class ActorRole(StrEnum):
    admin = "admin"
    sales = "sales"
    support = "support"
    finance = "finance"


class AdminAuditEvent(BaseModel):
    """
    One immutable entry of `audit_log`.
    """

    id: Uuid
    at: Timestamp
    actor_id: Uuid
    actor_role: ActorRole
    action: str
    """
    Dotted key, e.g. `club.suspended`, `payment.recorded`, `video.viewed`.
    """
    club_id: Uuid | None
    target: str
    """
    What changed, e.g. `club:0192...` or `match:0192...`.
    """
    reason: str | None


class AdminAuditEventPage(Page):
    items: list[AdminAuditEvent]


class TrendItem(RootModel[int]):
    root: Annotated[int, Field(ge=0)]


class AdminUsageRow(BaseModel):
    """
    Usage of a club in a month (SA-06).
    """

    club_id: Uuid
    club_name: str
    period: Annotated[str, Field(pattern="^\\d{4}-(0[1-9]|1[0-2])$")]
    tier_usage: AdminTierUsage
    bookings: Annotated[int, Field(ge=0)]
    recorded_matches: Annotated[int, Field(ge=0)]
    storage_gb: Annotated[float, Field(ge=0.0)]
    video_minutes: Annotated[int, Field(ge=0)]
    estimated_cost_cents: AmountCents
    """
    Our infrastructure cost for the club in the month.
    """
    invoiced_cents: AmountCents
    near_limit: bool
    """
    True when the club is within 10% of the next band.
    """
    trend: Annotated[list[TrendItem], Field(max_length=12)]
    """
    Active players at the end of each of the last months, oldest first (sparkline).
    """


class AdminUsagePage(Page):
    items: list[AdminUsageRow]


class AdminInvoiceStatus(StrEnum):
    draft = "draft"
    issued = "issued"
    paid = "paid"
    overdue = "overdue"
    void = "void"


class AdminInvoice(BaseModel):
    """
    Subscription invoice from us to a club.
    """

    id: Uuid
    club_id: Uuid
    club_name: str
    period: Annotated[str, Field(pattern="^\\d{4}-(0[1-9]|1[0-2])$")]
    status: AdminInvoiceStatus
    amount_cents: AmountCents
    paid_cents: AmountCents
    due_on: date_aliased
    invoice_number: str | None
    """
    ARCA number once issued.
    """
    issued_at: Timestamp | None


class AdminInvoicePage(Page):
    items: list[AdminInvoice]


class AdminClubPayment(BaseModel):
    id: Uuid
    club_id: Uuid
    amount_cents: AmountCents
    method: AdminPaymentMethod
    paid_on: date_aliased
    reference: str | None
    invoice_ids: list[Uuid]
    recorded_by: Uuid
    recorded_at: Timestamp


class AdminManualPaymentCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    amount_cents: Annotated[int, Field(ge=1)]
    """
    Amount in ARS cents.
    """
    method: AdminPaymentMethod
    paid_on: date_aliased
    reference: Annotated[str | None, Field(max_length=120)] = None
    """
    Receipt or transfer id; unique per club.
    """
    invoice_ids: Annotated[list[Uuid] | None, Field(max_length=24)] = None
    note: Annotated[str | None, Field(max_length=500)] = None


class AdminDunningPauseUpdate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    paused_until: date_aliased | None
    """
    Last day of the pause, up to 60 days ahead; `null` resumes dunning.
    """
    reason: Annotated[str, Field(max_length=500, min_length=3)]


class Kind3(StrEnum):
    invoice_issued = "invoice_issued"
    reminder_sent = "reminder_sent"
    payment_recorded = "payment_recorded"
    dunning_paused = "dunning_paused"
    dunning_resumed = "dunning_resumed"
    suspended = "suspended"
    reactivated = "reactivated"


class TimelineItem(BaseModel):
    at: Timestamp
    kind: Kind3


class AdminClubBilling(BaseModel):
    """
    B2B account statement of a club (SA-08).
    """

    club_id: Uuid
    status: AdminClubStatus
    balance_cents: int
    """
    Positive is what the club owes. ARS cents.
    """
    overdue_days: Annotated[int, Field(ge=0)]
    dunning_paused_until: date_aliased | None
    invoices: list[AdminInvoice]
    payments: list[AdminClubPayment]
    timeline: list[TimelineItem]
    """
    Reminders, suspensions and reactivations, newest first.
    """


class Billing(BaseModel):
    balance_cents: int
    overdue_days: Annotated[int, Field(ge=0)]
    last_payment_at: Timestamp | None


class AdminClubDetail(BaseModel):
    """
    Club file for the console (SA-03a).
    """

    id: Uuid
    name: str
    status: AdminClubStatus
    plan: ClubPlan
    legal: AdminLegalData
    modules: AdminModules
    tier_usage: AdminTierUsage
    billing: Billing
    users: list[AdminUserRef]
    recent_audit: Annotated[list[AdminAuditEvent], Field(max_length=20)]
    whitelabel_url: AnyUrl
    """
    Link and QR payload of the club's white-label page.
    """
    created_at: Timestamp


class Module(StrEnum):
    deposit = "deposit"
    branding_own = "branding_own"
    lessons_app = "lessons_app"
    ai_video_club_pays = "ai_video_club_pays"
    ai_video_player_pays = "ai_video_player_pays"
    tournaments = "tournaments"


class AdminModulePrice(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    module: Module
    monthly_cents: AmountCents


class AdminTariffTier(BaseModel):
    """
    One band of active players and the monthly subscription it costs (decision
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    min_active_players: Annotated[int, Field(ge=0)]
    max_active_players: Annotated[int | None, Field(ge=1)]
    """
    `null` for the top band.
    """
    monthly_cents: AmountCents


class AdminTariffVersionCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    name: Annotated[str, Field(max_length=80, min_length=1)]
    effective_from: date_aliased
    tiers: Annotated[list[AdminTariffTier], Field(max_length=12, min_length=1)]
    module_prices: Annotated[list[AdminModulePrice], Field(max_length=12)]


class AdminTariffVersion(AdminTariffVersionCreate):
    id: Uuid
    published_by: Uuid
    published_at: Timestamp
    clubs_on_version: Annotated[int, Field(ge=0)]


class AdminTariffVersionPage(Page):
    items: list[AdminTariffVersion]


class AdminInvoiceSimulationRequest(BaseModel):
    """
    Give `tariff_version_id` for a published version or `draft` for an unpublished one.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    tariff_version_id: Uuid | None = None
    draft: AdminTariffVersionCreate | None = None
    active_players: Annotated[int, Field(ge=0)]
    modules: AdminModules


class AdminInvoiceSimulation(BaseModel):
    tier: PricingTier
    subscription_cents: AmountCents
    modules_cents: AmountCents
    total_cents: AmountCents


class AdminSupportAccessCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    match_id: Uuid
    reason: Annotated[str, Field(max_length=500, min_length=3)]
    """
    Why support needs the video, e.g. a ticket id.
    """
    duration_minutes: Annotated[int, Field(ge=5, le=240)]


class AdminSupportAccess(BaseModel):
    id: Uuid
    match_id: Uuid
    club_id: Uuid
    granted_to: Uuid
    reason: str
    expires_at: Timestamp
    audit_event_id: Uuid
    """
    The `audit_log` entry that registers the permission.
    """


class AdminVideoUrl(BaseModel):
    url: AnyUrl
    expires_at: Timestamp
    """
    One hour after the call, or sooner if the permission ends first.
    """


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
    items: list[Clip1]


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


class ClubBookingPage(Page):
    items: list[ClubBooking]


class SettlementPage(Page):
    items: list[Settlement]


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
