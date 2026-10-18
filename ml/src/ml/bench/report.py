"""JSON and Markdown output of a benchmark run."""

from __future__ import annotations

import json
from pathlib import Path

from ml.bench.harness import BenchReport


def _verdict(ok: bool) -> str:
    return "PASS" if ok else "FAIL"


def render_markdown(report: BenchReport) -> str:
    device = report.device
    gpus = ", ".join(device.gpus) if device.gpus else "none detected"
    lines = [
        "# Pipeline speed benchmark",
        "",
        f"Result: **{_verdict(report.passed)}** "
        f"(target {report.target_realtime_factor:g}x real time per camera, "
        f"worst camera {report.worst_realtime_factor:.2f}x, "
        f"analysis at {report.analysis_fps} fps)",
        "",
        "## Device",
        "",
        f"- Host: {device.hostname}",
        f"- OS: {device.os}",
        f"- Python: {device.python}",
        f"- CPU: {device.cpu} ({device.cpu_count} cores)",
        f"- GPU: {gpus}",
        "",
        "## Cameras",
        "",
        "| Camera | Frames | Video s | Wall s | Frames/s | x real time | Result |",
        "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    lines.extend(
        f"| {c.camera_id} | {c.frames} | {c.video_s:.2f} | {c.wall_s:.4f} | "
        f"{c.frames_per_s:.1f} | {c.realtime_factor:.2f} | {_verdict(c.meets_target)} |"
        for c in report.cameras
    )
    for camera in report.cameras:
        lines.extend(
            [
                "",
                f"### Stages, {camera.camera_id}",
                "",
                "| Stage | Total s | Mean s/frame | Share of wall |",
                "| --- | ---: | ---: | ---: |",
            ]
        )
        lines.extend(
            f"| {s.name} | {s.total_s:.4f} | {s.mean_s_per_frame:.6f} | {s.share_of_wall:.1%} |"
            for s in camera.stages
        )
    return "\n".join(lines) + "\n"


def write_reports(report: BenchReport, out_dir: Path) -> tuple[Path, Path]:
    """Write ``bench.json`` and ``bench.md`` into ``out_dir``; return both paths."""
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "bench.json"
    md_path = out_dir / "bench.md"
    payload = report.model_dump(mode="json")
    payload["passed"] = report.passed
    payload["worst_realtime_factor"] = report.worst_realtime_factor

    json_path.write_text(json.dumps(payload, indent="  ") + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(report), encoding="utf-8")
    return json_path, md_path
