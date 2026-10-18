"""Command line: ``uv run --directory ml python -m ml.bench --cameras 2 --out reports/``.

Exits non-zero when any camera misses ``performance.min_realtime_factor``.
"""

from __future__ import annotations

import argparse
import sys
from functools import partial
from pathlib import Path

from ml.bench.harness import run_benchmark, synthetic_frames
from ml.bench.report import write_reports
from ml.bench.stages import dummy_stages
from ml.thresholds import DEFAULT_THRESHOLDS_PATH, load_thresholds


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m ml.bench", description=__doc__)
    parser.add_argument("--cameras", type=int, default=1, help="synthetic cameras to run")
    parser.add_argument("--out", type=Path, default=Path("bench-report"))
    parser.add_argument("--thresholds", type=Path, default=DEFAULT_THRESHOLDS_PATH)
    args = parser.parse_args(argv)

    perf = load_thresholds(args.thresholds).performance
    source = partial(
        synthetic_frames,
        duration_s=perf.synthetic_duration_s,
        fps=perf.analysis_fps,
        width_px=perf.synthetic_width_px,
        height_px=perf.synthetic_height_px,
        channels=perf.synthetic_channels,
    )
    report = run_benchmark(
        {f"cam-{n}": source for n in range(1, args.cameras + 1)},
        dummy_stages(),
        fps=perf.analysis_fps,
        target_realtime_factor=perf.min_realtime_factor,
    )
    json_path, md_path = write_reports(report, args.out)
    sys.stdout.write(f"{json_path}\n{md_path}\n")
    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
