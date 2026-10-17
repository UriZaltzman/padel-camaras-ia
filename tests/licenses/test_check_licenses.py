"""Unit tests for the license gate. Run: uv run --no-project
--with-requirements tests/licenses/requirements.txt pytest tests/licenses"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import check_licenses as cl

POLICY = cl.load_policy(cl.HERE / "policy.yaml")
A = POLICY.allowed


@pytest.mark.parametrize(
    ("expression", "expected"),
    [
        ("MIT", cl.Category.OK),
        ("Apache-2.0 OR BSD-2-Clause", cl.Category.OK),
        ("(MIT OR GPL-3.0-or-later)", cl.Category.OK),
        ("MIT AND ISC", cl.Category.OK),
        ("AGPL-3.0", cl.Category.DENIED),
        ("AGPL-3.0-only", cl.Category.DENIED),
        ("GPL-2.0+", cl.Category.DENIED),
        ("GPL-3.0-or-later", cl.Category.DENIED),
        ("MIT AND GPL-3.0", cl.Category.DENIED),
        ("(MIT AND GPL-2.0) OR AGPL-3.0", cl.Category.DENIED),
        ("SSPL-1.0", cl.Category.DENIED),
        ("GNU General Public License v3 (GPLv3)", cl.Category.DENIED),
        ("GNU Affero General Public License v3", cl.Category.DENIED),
        ("LGPL-3.0-or-later", cl.Category.WEAK_COPYLEFT),
        ("GNU Lesser General Public License v2 or later (LGPLv2+)", cl.Category.WEAK_COPYLEFT),
        ("LGPL-2.1 OR MIT", cl.Category.OK),
        ("Apache-2.0 WITH LLVM-exception", cl.Category.OK),
        ("(BSD License) AND (Apache Software License)", cl.Category.OK),
        ("", cl.Category.UNKNOWN),
        ("UNKNOWN", cl.Category.UNKNOWN),
        ("UNLICENSED", cl.Category.UNKNOWN),
        ("Proprietary", cl.Category.UNKNOWN),
        ("SEE LICENSE IN LICENSE.md", cl.Category.UNKNOWN),
        ("MIT OR (", cl.Category.UNKNOWN),
    ],
)
def test_classify_expression(expression: str, expected: cl.Category) -> None:
    assert cl.classify_expression(expression, A) == expected


def test_python_metadata_prefers_expression_then_classifiers() -> None:
    assert cl.classify_python({"license_expression": "MIT", "license": "GPL"}, A) == (
        "MIT",
        cl.Category.OK,
    )
    mpl = {"classifiers": ["License :: OSI Approved :: Mozilla Public License 2.0 (MPL 2.0)"]}
    assert cl.classify_python(mpl, A)[1] == cl.Category.OK
    agpl = {
        "classifiers": [
            "License :: OSI Approved",
            "License :: OSI Approved :: MIT License",
            "License :: OSI Approved :: GNU Affero General Public License v3",
        ],
    }
    assert cl.classify_python(agpl, A)[1] == cl.Category.DENIED
    full_text = "Copyright (c) 2020\n\nPermission is hereby granted, free of charge, to any person"
    assert cl.classify_python({"license": full_text}, A)[1] == cl.Category.OK
    gpl_text = "GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n" + "x" * 200
    assert cl.classify_python({"license": gpl_text}, A)[1] == cl.Category.DENIED
    assert cl.classify_python({}, A)[1] == cl.Category.UNKNOWN


def test_node_agpl_dependency_fails() -> None:
    report = cl.Report()
    pnpm_json = {
        "MIT": [{"name": "left-pad", "versions": ["1.3.0"], "license": "MIT"}],
        "AGPL-3.0-only": [{"name": "evil", "versions": ["0.1.0"], "license": "AGPL-3.0-only"}],
    }
    cl.check_node(report, POLICY, pnpm_json)
    assert report.checked["npm"] == 2
    assert len(report.errors) == 1
    assert "evil@0.1.0" in report.errors[0]


def _write_lock(tmp_path: Path, packages: list[str]) -> Path:
    body = (
        'version = 1\n[[package]]\nname = "ours"\nversion = "0.0.0"\nsource = { editable = "x" }\n'
    )
    for name in packages:
        body += (
            f'[[package]]\nname = "{name}"\nversion = "1.0.0"\n'
            'source = { registry = "https://pypi.org/simple" }\n'
        )
    body += '[[package]]\nname = "gitdep"\nversion = "1.0.0"\nsource = { git = "https://x" }\n'
    lock = tmp_path / "uv.lock"
    lock.write_text(body)
    return lock


def test_python_agpl_dependency_and_unknown_source_fail(tmp_path: Path) -> None:
    lock = _write_lock(tmp_path, ["pydantic", "ultralytics", "lgpl-lib"])
    infos: dict[str, dict[str, Any]] = {
        "pydantic": {"license_expression": "MIT"},
        "ultralytics": {"license_expression": "AGPL-3.0"},
        "lgpl-lib": {"license": "LGPL-3.0"},
    }
    report = cl.Report()
    cl.check_python(report, POLICY, lock, fetch=lambda pkg: infos[pkg.name])
    assert report.checked["pypi"] == 3
    joined = "\n".join(report.errors)
    assert "ultralytics" in joined
    assert "gitdep" in joined
    assert "pydantic" not in joined
    assert any("lgpl-lib" in w for w in report.warnings)


def test_denied_by_name_even_if_metadata_says_mit(tmp_path: Path) -> None:
    lock = _write_lock(tmp_path, ["ultralytics"])
    report = cl.Report()
    cl.check_python(report, POLICY, lock, fetch=lambda _pkg: {"license_expression": "MIT"})
    assert any("ultralytics" in e for e in report.errors)


def test_exceptions_cover_unknown_but_never_gpl() -> None:
    policy = cl.Policy(
        allowed=A,
        allow_lgpl=True,
        denied_packages=frozenset(),
        exceptions={("npm", "odd", "1.0.0"): {}, ("npm", "gpl-thing", "1.0.0"): {}},
    )
    assert cl.evaluate(policy, "npm", "odd", "1.0.0", "Custom") is None
    assert cl.evaluate(policy, "npm", "odd", "2.0.0", "Custom") is not None
    finding = cl.evaluate(policy, "npm", "gpl-thing", "1.0.0", "GPL-3.0")
    assert finding is not None
    assert finding.category == cl.Category.DENIED


def _models(tmp_path: Path, content: str) -> Path:
    path = tmp_path / "models.yaml"
    path.write_text(content)
    return path


def test_models_registry_validation(tmp_path: Path) -> None:
    ok = _models(
        tmp_path,
        "models:\n- name: ball\n  source: https://x\n  weights_license: Apache-2.0\n"
        "  code_license: MIT\n  files: [ml/models/ball.onnx]\n",
    )
    report = cl.Report()
    cl.check_models(report, POLICY, ok, ["ml/models/ball.onnx", "README.md"])
    assert report.errors == []

    agpl = _models(
        tmp_path,
        "models:\n- name: yolov8n\n  source: ultralytics\n  weights_license: AGPL-3.0\n"
        "  code_license: AGPL-3.0\n- name: incomplete\n  source: x\n",
    )
    report = cl.Report()
    cl.check_models(report, POLICY, agpl, ["ml/models/stray.pt"])
    joined = "\n".join(report.errors)
    assert "DENIED [model] yolov8n: weights_license" in joined
    assert "missing ['weights_license', 'code_license']" in joined
    assert "ml/models/stray.pt' is committed but not in models.yaml" in joined


def test_cli_passes_on_repo_without_node_and_python() -> None:
    """The registry and policy shipped in the repo are valid."""
    result = subprocess.run(  # noqa: S603 (fixed arguments)
        [sys.executable, str(cl.HERE / "check_licenses.py"), "--skip-node", "--skip-python"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
