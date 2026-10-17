"""Camera simulator: replays recorded videos as RTSP streams, 2 per court (A and B).

FFmpeg publishes each camera to an RTSP server (mediamtx) as a separate process, so the
rest of the team can test the recorder, clipper and health checks without hardware.
"""
