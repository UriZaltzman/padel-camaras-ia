"""Print the accuracy table: ``uv run python tests/score_engine_report.py 30``."""

from __future__ import annotations

import sys

from study import markdown_table, run_study

LEVELS = (0.0, 0.02, 0.05, 0.10)

if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    seeds = range(1000, 1000 + count)
    header = f"{count} simulated matches per noise level (seeds from {seeds[0]})\n\n"
    sys.stdout.write(header + markdown_table(run_study(LEVELS, seeds)) + "\n")
