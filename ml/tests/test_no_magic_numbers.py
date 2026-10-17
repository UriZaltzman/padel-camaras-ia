"""No numeric threshold may live in the ml source code: they belong in thresholds.yaml."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

SRC_DIR = Path(__file__).resolve().parents[1] / "src"
# 0 and 1 are identities and bounds (probabilities, indices), never tunable thresholds.
ALLOWED_NUMBERS = {0, 1}


def _source_files() -> list[Path]:
    return sorted(SRC_DIR.rglob("*.py"))


def _numeric_literals(path: Path) -> list[tuple[int, object]]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found: list[tuple[int, object]] = []
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Constant)
            and isinstance(node.value, int | float | complex)
            and not isinstance(node.value, bool)
            and node.value not in ALLOWED_NUMBERS
        ):
            found.append((node.lineno, node.value))
    return found


def test_there_is_source_to_scan() -> None:
    assert _source_files()


@pytest.mark.parametrize("path", _source_files(), ids=lambda p: str(p.relative_to(SRC_DIR)))
def test_no_numeric_literals_in_source(path: Path) -> None:
    literals = _numeric_literals(path)
    assert not literals, f"move these numbers to ml/config/thresholds.yaml: {literals}"


def test_detector_catches_a_magic_number(tmp_path: Path) -> None:
    sample = tmp_path / "stage.py"
    sample.write_text("def is_shot(angle: float) -> bool:\n    return angle > 35.0\n")
    assert _numeric_literals(sample) == [(2, 35.0)]
