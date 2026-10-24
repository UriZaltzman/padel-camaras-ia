"""Typed loader for ``ml/config/thresholds.yaml``.

Every AI threshold lives in that YAML file. The models below mirror it one to one: a missing
key, an unknown key or a value of the wrong type raises ``pydantic.ValidationError`` when the
file is loaded, so a misconfigured pipeline never starts.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Annotated, Self

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

_PROJECT_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_THRESHOLDS_PATH = _PROJECT_DIR / "config" / "thresholds.yaml"

Share = Annotated[float, Field(ge=0.0, le=1.0)]
"""A fraction or probability between 0 and 1."""

PositiveFloat = Annotated[float, Field(gt=0.0)]
PositiveInt = Annotated[int, Field(gt=0)]


class _Section(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class CourtGeometry(_Section):
    width_m: PositiveFloat
    length_m: PositiveFloat
    net_y_m: PositiveFloat
    net_height_center_m: PositiveFloat
    net_height_posts_m: PositiveFloat
    service_line_from_net_m: PositiveFloat
    back_glass_height_m: PositiveFloat
    wall_height_m: PositiveFloat
    side_glass_from_back_m: PositiveFloat
    ball_radius_m: PositiveFloat


class CalibrationThresholds(_Section):
    reference_points: PositiveInt
    max_mean_error_cm: PositiveFloat
    daily_check_local_hour: Annotated[int, Field(ge=0)]
    court_mask_margin_m: PositiveFloat
    ransac_reproj_threshold_px: PositiveFloat
    ransac_confidence: Share
    ransac_max_iters: PositiveInt
    drift_max_mean_shift_cm: PositiveFloat


class PlayerThresholds(_Section):
    min_confidence: Share
    players_on_court: PositiveInt


class TrackingThresholds(_Section):
    bytetrack_match_threshold: Share
    track_memory_s: PositiveFloat


class BallThresholds(_Section):
    input_width_px: PositiveInt
    input_height_px: PositiveInt
    input_frames: PositiveInt
    min_heatmap_peak: Share
    kalman_max_gap_frames: PositiveInt
    gravity_mps2: PositiveFloat


class BallTrackThresholds(_Section):
    measurement_sigma_px: PositiveFloat
    process_accel_sigma_px_s2: PositiveFloat
    min_segment_points: PositiveInt
    max_speed_px_s: PositiveFloat
    start_max_gap_frames: PositiveInt
    gate_sigma: PositiveFloat
    reset_after_rejections: PositiveInt
    min_confidence: Share
    initial_velocity_sigma_px_s: PositiveFloat
    initial_acceleration_sigma_px_s2: PositiveFloat


class TriangulationThresholds(_Section):
    min_confidence: Share
    sync_search_ms: PositiveFloat
    sync_step_ms: PositiveFloat
    sync_min_pairs: PositiveInt
    min_ray_angle_deg: PositiveFloat
    max_ray_gap_m: PositiveFloat
    min_height_m: float
    max_height_m: PositiveFloat
    max_time_gap_ms: PositiveFloat
    max_bridge_ms: PositiveFloat
    height_tolerance_m: PositiveFloat


class PoseThresholds(_Section):
    window_s: PositiveFloat
    keypoints: PositiveInt


class ShotThresholds(_Section):
    min_direction_change_deg: PositiveFloat
    max_wrist_distance_m: PositiveFloat
    fit_window_ms: PositiveFloat
    fit_guard_ms: PositiveFloat
    min_fit_points: PositiveInt
    min_speed_change_share: Share
    min_speed_for_direction_mps: PositiveFloat
    min_separation_ms: PositiveFloat
    wrist_time_slack_ms: PositiveFloat
    contact_exclusion_ms: PositiveFloat


class BounceThresholds(_Section):
    fit_window_ms: PositiveFloat
    fit_guard_ms: PositiveFloat
    min_fit_points: PositiveInt
    min_normal_speed_change_mps: PositiveFloat
    surface_tolerance_m: PositiveFloat
    floor_tolerance_m: PositiveFloat
    min_separation_ms: PositiveFloat
    net_height_margin_m: PositiveFloat
    net_residual_speed_share: Share
    min_normal_alignment: Share
    min_dual_camera_3d_share: Share


class ShotTypeThresholds(_Section):
    min_confidence: Share
    pose_half_window_frames: PositiveInt


class PointThresholds(_Section):
    ball_lost_timeout_s: PositiveFloat
    min_confidence: Share
    serves_per_point: PositiveInt
    reopen_window_s: PositiveFloat
    new_point_gap_s: PositiveFloat
    inferred_event_factor: Share
    anomaly_factor: Share
    ball_lost_factor: Share
    inserted_point_confidence: Share
    max_event_confidence: Share
    insert_cost: PositiveFloat
    delete_penalty: PositiveFloat
    server_mismatch_cost: PositiveFloat
    max_inserts_per_gap: PositiveInt
    beam_width: PositiveInt


class ScoringRules(_Section):
    points_per_game: PositiveInt
    min_point_lead: PositiveInt
    sets_to_win: PositiveInt
    games_per_set: PositiveInt
    min_game_lead: PositiveInt
    tiebreak_points: PositiveInt
    super_tiebreak_points: PositiveInt
    side_change_every_games: PositiveInt
    tiebreak_side_change_points: PositiveInt
    tiebreak_serve_run_points: PositiveInt


class StatsThresholds(_Section):
    zone_columns: PositiveInt
    zone_rows: PositiveInt
    net_zone_depth_m: PositiveFloat
    coverage_uncovered_distance_m: PositiveFloat
    net_unguarded_distance_m: PositiveFloat
    net_unguarded_min_points: PositiveInt
    net_unguarded_min_lost_share: Share
    same_side_player_share: Share
    same_side_third_share: Share
    forced_error_move_distance_m: PositiveFloat
    forced_error_move_time_s: PositiveFloat
    net_time_distance_m: PositiveFloat
    net_approach_from_m: PositiveFloat
    net_approach_to_m: PositiveFloat
    position_smoothing_window_s: PositiveFloat
    heatmap_cell_m: PositiveFloat
    ball_speed_frames_after_shot: PositiveInt


class HighlightThresholds(_Section):
    weight_rally_length: Share
    weight_smash_or_vibora_winner: Share
    weight_ball_speed: Share
    weight_key_point: Share
    top_points: PositiveInt
    tail_after_point_s: PositiveFloat

    @model_validator(mode="after")
    def _weights_add_up_to_one(self) -> Self:
        total = (
            self.weight_rally_length
            + self.weight_smash_or_vibora_winner
            + self.weight_ball_speed
            + self.weight_key_point
        )
        if not math.isclose(total, 1.0):
            msg = f"highlight weights must add up to 1, got {total}"
            raise ValueError(msg)
        return self


class InsightThresholds(_Section):
    facts_per_match: PositiveInt
    max_words_per_phrase: PositiveInt


class ReelThresholds(_Section):
    width_px: PositiveInt
    height_px: PositiveInt
    min_duration_s: PositiveFloat
    max_duration_s: PositiveFloat
    logo_duration_s: PositiveFloat
    highlights: PositiveInt

    @model_validator(mode="after")
    def _duration_range_is_ordered(self) -> Self:
        if self.min_duration_s > self.max_duration_s:
            msg = "reel min_duration_s must not exceed max_duration_s"
            raise ValueError(msg)
        return self


class LessonModeThresholds(_Section):
    min_out_of_range_share: Share
    top_improvements: PositiveInt


class RatingThresholds(_Section):
    min_matches_to_show: PositiveInt


class PerformanceThresholds(_Section):
    min_realtime_factor: PositiveFloat
    analysis_fps: PositiveInt
    synthetic_duration_s: PositiveFloat
    synthetic_width_px: PositiveInt
    synthetic_height_px: PositiveInt
    synthetic_channels: PositiveInt
    gpu_probe_timeout_s: PositiveFloat


class Thresholds(_Section):
    """All thresholds of the pipeline, grouped by the spec section that uses them."""

    court: CourtGeometry
    calibration: CalibrationThresholds
    players: PlayerThresholds
    tracking: TrackingThresholds
    ball: BallThresholds
    ball_track: BallTrackThresholds
    triangulation: TriangulationThresholds
    pose: PoseThresholds
    shots: ShotThresholds
    bounces: BounceThresholds
    shot_type: ShotTypeThresholds
    point: PointThresholds
    scoring: ScoringRules
    stats: StatsThresholds
    highlights: HighlightThresholds
    insights: InsightThresholds
    reel: ReelThresholds
    lesson_mode: LessonModeThresholds
    rating: RatingThresholds
    performance: PerformanceThresholds


def load_thresholds(path: Path = DEFAULT_THRESHOLDS_PATH) -> Thresholds:
    """Read and validate the thresholds file. Raises ``ValidationError`` if it is invalid."""
    with path.open(encoding="utf-8") as handle:
        raw: object = yaml.safe_load(handle)
    return Thresholds.model_validate(raw)
