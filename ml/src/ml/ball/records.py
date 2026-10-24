"""Typed records of the ball stages."""

from __future__ import annotations

from typing import Annotated

from pydantic import Field

from ml.schemas import Camera, Confidence, NonNegativeInt, StageRecord

PixelCoordinate = Annotated[float, Field(allow_inf_nan=False)]


class BallDetection(StageRecord):
    """One neural-detector peak: where the ball seems to be in a raw (distorted) frame."""

    camera: Camera
    frame: NonNegativeInt
    time_ms: NonNegativeInt
    confidence: Confidence
    x_px: PixelCoordinate
    y_px: PixelCoordinate


class TrackPoint(StageRecord):
    """One frame of the smoothed per-camera track, in undistorted pixels."""

    camera: Camera
    frame: NonNegativeInt
    time_ms: NonNegativeInt
    confidence: Confidence
    x_px: PixelCoordinate
    y_px: PixelCoordinate
    vx_px_s: PixelCoordinate
    vy_px_s: PixelCoordinate
    interpolated: bool = False
