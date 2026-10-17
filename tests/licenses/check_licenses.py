"""License gate: no AGPL / GPL (or other strong copyleft) in what we distribute.

Checks three things and exits non-zero if any of them fails:

1. Node dependencies of the pnpm workspace, from the output of
   ``pnpm licenses list --json`` (needs ``pnpm install`` first).
2. Python dependencies of the uv workspace, read from ``uv.lock``. Licenses come
   from the core metadata of the exact locked wheel (PEP 658, falling back to
   the PyPI JSON API), so nothing has to be installed (heavy ML wheels included)
   and packages locked for other platforms are checked too.
3. Model weights registered in ``tests/licenses/models.yaml``, plus a scan that
   fails if a weights file is committed without being registered there.

Policy (allowed licenses, LGPL switch, human-approved exceptions) lives in
``tests/licenses/policy.yaml``.

Usage (from the repo root):
    pnpm licenses list --json > /tmp/pnpm-licenses.json
    uv run --no-project --with-requirements tests/licenses/requirements.txt \
        python tests/licenses/check_licenses.py --pnpm-json /tmp/pnpm-licenses.json
"""

from __future__ import annotations

import argparse
import email.parser
import enum
import http
import json
import re
import shutil
import subprocess
import sys
import time
import tomllib
import urllib.error
import urllib.request
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
PYPI_SIMPLE = "https://pypi.org/simple"
PYPI_JSON = "https://pypi.org/pypi/{name}/{version}/json"
# A "License" metadata field longer than this is treated as a full license text.
MAX_LICENSE_NAME_LEN = 120

WEIGHT_EXTENSIONS = frozenset(
    {
        ".pt",
        ".pth",
        ".ckpt",
        ".onnx",
        ".engine",
        ".plan",
        ".trt",
        ".safetensors",
        ".tflite",
        ".pb",
        ".h5",
        ".keras",
        ".weights",
        ".mlmodel",
        ".rknn",
    }
)


class Category(enum.IntEnum):
    """Ordered from best to worst, so ``max`` gives the most restrictive."""

    OK = 0
    WEAK_COPYLEFT = 1  # LGPL: allowed or not depending on policy.allow_lgpl
    UNKNOWN = 2
    DENIED = 3


# Order matters: AGPL / LGPL must be tested before plain GPL.
_COPYLEFT_PATTERNS: tuple[tuple[re.Pattern[str], Category], ...] = (
    (re.compile(r"AGPL|AFFERO"), Category.DENIED),
    (re.compile(r"SSPL|SERVER SIDE PUBLIC"), Category.DENIED),
    (re.compile(r"LGPL|LESSER GENERAL PUBLIC|LIBRARY GENERAL PUBLIC"), Category.WEAK_COPYLEFT),
    (re.compile(r"(?<![A-Z])GPL|GENERAL PUBLIC LICEN[CS]E"), Category.DENIED),
)

# Heuristics for Python packages whose "License" field holds the full license text.
_PERMISSIVE_TEXT_MARKERS = (
    ("PERMISSION IS HEREBY GRANTED, FREE OF CHARGE", "MIT"),
    ("REDISTRIBUTION AND USE IN SOURCE AND BINARY FORMS", "BSD"),
    ("APACHE LICENSE", "Apache-2.0"),
    ("PERMISSION TO USE, COPY, MODIFY, AND/OR DISTRIBUTE", "ISC"),
)


@dataclass(frozen=True)
class Policy:
    allowed: frozenset[str]
    allow_lgpl: bool
    denied_packages: frozenset[tuple[str, str]]  # (ecosystem, normalized name)
    exceptions: dict[tuple[str, str, str], dict[str, Any]]  # (eco, name, version) -> entry


@dataclass
class Finding:
    ecosystem: str
    name: str
    version: str
    license: str
    category: Category
    hint: str = ""


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    checked: dict[str, int] = field(default_factory=dict)


def normalize_name(ecosystem: str, name: str) -> str:
    if ecosystem == "pypi":
        return re.sub(r"[-_.]+", "-", name).lower()
    return name.lower()


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().upper()


# --------------------------------------------------------------------------- #
# License classification
# --------------------------------------------------------------------------- #


def classify_token(token: str, allowed: frozenset[str]) -> Category:
    """Classify one license id or free-text name (no AND/OR inside)."""
    text = _norm(token).rstrip("+").strip()
    if not text:
        return Category.UNKNOWN
    for pattern, category in _COPYLEFT_PATTERNS:
        if pattern.search(text):
            return category
    if text in allowed:
        return Category.OK
    return Category.UNKNOWN


_TOKEN_RE = re.compile(r"\(|\)|[^\s()]+")


def classify_expression(expression: str, allowed: frozenset[str]) -> Category:
    """Classify an SPDX-like expression: OR picks the best side, AND the worst.

    ``X WITH some-exception`` is classified as ``X``: linking exceptions are
    rare enough that a human should review them through policy.yaml.
    Anything that does not parse falls back to classifying the whole string.
    """
    tokens: list[str] = _TOKEN_RE.findall(expression.strip())
    if not tokens:
        return Category.UNKNOWN
    pos = 0

    def peek() -> str | None:
        return tokens[pos] if pos < len(tokens) else None

    def take() -> str:
        nonlocal pos
        tok = tokens[pos]
        pos += 1
        return tok

    def parse_or() -> Category:
        result = parse_and()
        while (tok := peek()) is not None and tok.upper() == "OR":
            take()
            result = min(result, parse_and())
        return result

    def parse_and() -> Category:
        result = parse_atom()
        while (tok := peek()) is not None and tok.upper() == "AND":
            take()
            result = max(result, parse_atom())
        return result

    def parse_atom() -> Category:
        tok = peek()
        if tok is None:
            raise ValueError("unexpected end")
        if tok == "(":
            take()
            result = parse_or()
            if peek() != ")":
                raise ValueError("missing )")
            take()
            return result
        if tok == ")" or tok.upper() in {"AND", "OR", "WITH"}:
            raise ValueError(f"unexpected {tok}")
        # A license name can span several words ("BSD License", "GNU GPL v3").
        words = [take()]
        while (
            (nxt := peek()) is not None
            and nxt not in {"(", ")"}
            and nxt.upper()
            not in {
                "AND",
                "OR",
                "WITH",
            }
        ):
            words.append(take())
        result = classify_token(" ".join(words), allowed)
        if (nxt := peek()) is not None and nxt.upper() == "WITH":
            take()
            if peek() is None or peek() in {"(", ")"}:
                raise ValueError("WITH without exception id")
            take()
        return result

    try:
        result = parse_or()
        if pos != len(tokens):
            raise ValueError("trailing tokens")
        return result
    except ValueError:
        return classify_token(expression, allowed)


def has_license_data(info: dict[str, Any]) -> bool:
    return bool(
        (info.get("license_expression") or "").strip()
        or (info.get("license") or "").strip()
        or any(c.startswith("License ::") for c in info.get("classifiers") or [])
    )


def classify_python(info: dict[str, Any], allowed: frozenset[str]) -> tuple[str, Category]:
    """Classify Python core metadata: License-Expression > classifiers > License.

    Returns (license as displayed, category).
    """
    expression = (info.get("license_expression") or "").strip()
    if expression:
        return expression, classify_expression(expression, allowed)
    classifiers = [
        c.split("::")[-1].strip()
        for c in info.get("classifiers") or []
        if c.startswith("License ::") and c.strip() != "License :: OSI Approved"
    ]
    if classifiers:
        # Several classifiers: be conservative and require all of them to pass.
        return " + ".join(classifiers), max(classify_token(c, allowed) for c in classifiers)
    text = (info.get("license") or "").strip()
    if "\n" in text or len(text) > MAX_LICENSE_NAME_LEN:
        upper = _norm(text)
        first_line = text.splitlines()[0][:80]
        for pattern, category in _COPYLEFT_PATTERNS:
            if pattern.search(upper):
                return f"{first_line}...", category
        for marker, spdx in _PERMISSIVE_TEXT_MARKERS:
            if marker in upper:
                return f"{spdx} (from license text)", Category.OK
        return f"{first_line}... (license text not recognized)", Category.UNKNOWN
    return text, classify_expression(text, allowed)


# --------------------------------------------------------------------------- #
# Inputs
# --------------------------------------------------------------------------- #


def load_policy(path: Path) -> Policy:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    allowed = frozenset(_norm(x) for x in data.get("allowed_licenses") or [])
    denied = frozenset(
        (d["ecosystem"], normalize_name(d["ecosystem"], d["name"]))
        for d in data.get("denied_packages") or []
    )
    exceptions: dict[tuple[str, str, str], dict[str, Any]] = {}
    for entry in data.get("exceptions") or []:
        missing = [
            k
            for k in ("ecosystem", "name", "version", "license", "reason", "approved_by")
            if not str(entry.get(k) or "").strip()
        ]
        if missing:
            raise SystemExit(f"policy.yaml: exception {entry!r} is missing {missing}")
        eco = entry["ecosystem"]
        key = (eco, normalize_name(eco, entry["name"]), str(entry["version"]))
        exceptions[key] = entry
    return Policy(
        allowed=allowed,
        allow_lgpl=bool(data.get("allow_lgpl", False)),
        denied_packages=denied,
        exceptions=exceptions,
    )


def node_packages(pnpm_json: dict[str, list[dict[str, Any]]]) -> Iterable[tuple[str, str, str]]:
    """Yield (name, version, license) from ``pnpm licenses list --json``."""
    for group_license, packages in pnpm_json.items():
        for pkg in packages:
            license_ = str(pkg.get("license") or group_license or "")
            for version in pkg.get("versions") or [None]:
                # pnpm reports no version for file:/link: dependencies.
                yield pkg["name"], str(version or "?"), license_


@dataclass(frozen=True)
class LockedPackage:
    name: str
    version: str
    wheel_url: str | None  # any wheel of that exact version, for PEP 658 metadata


def locked_python_packages(lock_path: Path) -> tuple[list[LockedPackage], list[str]]:
    """Return (packages from PyPI, problems) for every package in ``uv.lock``.

    Workspace members (editable / virtual / directory sources) are our own code
    and are skipped. Packages from any other source cannot be checked
    automatically and are reported as problems.
    """
    lock = tomllib.loads(lock_path.read_text(encoding="utf-8"))
    from_pypi: list[LockedPackage] = []
    problems: list[str] = []
    for pkg in lock.get("package", []):
        source = pkg.get("source", {})
        if {"editable", "virtual", "directory"} & source.keys():
            continue
        registry = source.get("registry", "")
        if registry.rstrip("/") == PYPI_SIMPLE:
            wheels = pkg.get("wheels") or []
            wheel_url = str(wheels[0]["url"]) if wheels else None
            from_pypi.append(LockedPackage(pkg["name"], pkg["version"], wheel_url))
        else:
            problems.append(f"{pkg['name']} {pkg.get('version', '?')} comes from {source}")
    return from_pypi, problems


def _http_get(url: str, retries: int = 3) -> bytes | None:
    """GET a URL; None on 404, RuntimeError after retries on other failures."""
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=20) as resp:  # noqa: S310 (https only)
                body: bytes = resp.read()
                return body
        except urllib.error.HTTPError as exc:
            if exc.code == http.HTTPStatus.NOT_FOUND:
                return None
            last_error = exc
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
        time.sleep(2**attempt)
    raise RuntimeError(f"could not read {url}: {last_error}")


def fetch_python_metadata(pkg: LockedPackage) -> dict[str, Any]:
    """License metadata of the exact locked version.

    First the wheel's own core metadata (PEP 658 ``.metadata`` file, the same
    METADATA that gets installed), then the PyPI JSON API, which sometimes lacks
    the newer ``License-Expression`` field.
    """
    if pkg.wheel_url and pkg.wheel_url.startswith("https://"):
        raw = _http_get(pkg.wheel_url + ".metadata")
        if raw is not None:
            msg = email.parser.BytesParser().parsebytes(raw, headersonly=True)
            info = {
                "license_expression": str(msg.get("License-Expression") or ""),
                "license": str(msg.get("License") or ""),
                "classifiers": [str(c) for c in msg.get_all("Classifier") or []],
            }
            if has_license_data(info):
                return info
    raw = _http_get(PYPI_JSON.format(name=pkg.name, version=pkg.version))
    if raw is None:
        return {}
    data: dict[str, Any] = json.loads(raw)
    return dict(data.get("info") or {})


def tracked_files(repo_root: Path) -> list[str]:
    git = shutil.which("git")
    if git is None:
        raise SystemExit("git is required to look for committed model weights")
    out = subprocess.run(  # noqa: S603 (fixed arguments)
        [git, "ls-files", "-z"], cwd=repo_root, check=True, capture_output=True
    ).stdout
    return [p for p in out.decode().split("\0") if p]


# --------------------------------------------------------------------------- #
# Checks
# --------------------------------------------------------------------------- #


def evaluate(
    policy: Policy,
    ecosystem: str,
    name: str,
    version: str,
    license_: str,
    *,
    hint: str = "",
    category: Category | None = None,
) -> Finding | None:
    """Return a Finding if the package breaks the policy (None if it is fine)."""
    norm = normalize_name(ecosystem, name)
    if (ecosystem, norm) in policy.denied_packages:
        return Finding(ecosystem, name, version, license_, Category.DENIED, "denied by name")
    if category is None:
        category = classify_expression(license_, policy.allowed)
    if category == Category.OK:
        return None
    if (ecosystem, norm, version) in policy.exceptions:
        if category != Category.DENIED:
            return None
        hint = "AGPL/GPL/SSPL cannot be excepted in policy.yaml"
    return Finding(ecosystem, name, version, license_, category, hint)


def report_findings(report: Report, findings: list[Finding], policy: Policy) -> None:
    for f in sorted(findings, key=lambda f: (f.category, f.ecosystem, f.name), reverse=True):
        line = f"[{f.ecosystem}] {f.name}@{f.version}: {f.license or '(no license)'}"
        if f.hint:
            line += f"  -> {f.hint}"
        if f.category == Category.WEAK_COPYLEFT and policy.allow_lgpl:
            report.warnings.append(f"LGPL (allowed by policy) {line}")
        elif f.category == Category.UNKNOWN:
            report.errors.append(f"UNKNOWN/UNREVIEWED license {line}")
        else:
            report.errors.append(f"{f.category.name} {line}")


def check_node(report: Report, policy: Policy, pnpm_json: dict[str, list[dict[str, Any]]]) -> None:
    findings: list[Finding] = []
    count = 0
    for name, version, license_ in node_packages(pnpm_json):
        count += 1
        finding = evaluate(policy, "npm", name, version, license_, hint=f"pnpm why -r {name}")
        if finding:
            findings.append(finding)
    report.checked["npm"] = count
    report_findings(report, findings, policy)


def check_python(
    report: Report,
    policy: Policy,
    lock_path: Path,
    fetch: Callable[[LockedPackage], dict[str, Any]] = fetch_python_metadata,
) -> None:
    packages, problems = locked_python_packages(lock_path)
    for problem in problems:
        report.errors.append(f"[pypi] cannot verify license automatically: {problem}")
    with ThreadPoolExecutor(max_workers=8) as pool:
        infos = list(pool.map(fetch, packages))
    findings: list[Finding] = []
    for pkg, info in zip(packages, infos, strict=True):
        license_, category = classify_python(info, policy.allowed)
        finding = evaluate(
            policy,
            "pypi",
            pkg.name,
            pkg.version,
            license_,
            hint=f"uv tree --invert --package {pkg.name}",
            category=category,
        )
        if finding:
            findings.append(finding)
    report.checked["pypi"] = len(packages)
    report_findings(report, findings, policy)


MODEL_REQUIRED = ("name", "source", "weights_license", "code_license")


def _check_model_license(
    report: Report, policy: Policy, name: str, key: str, license_: str
) -> None:
    category = classify_expression(license_, policy.allowed)
    if category == Category.OK:
        return
    if category == Category.WEAK_COPYLEFT and policy.allow_lgpl:
        report.warnings.append(f"[model] {name}: {key} {license_} is LGPL")
    elif category == Category.UNKNOWN:
        report.errors.append(f"UNKNOWN/UNREVIEWED license [model] {name}: {key} {license_}")
    else:
        report.errors.append(f"{category.name} [model] {name}: {key} {license_}")


def _check_model_entry(
    report: Report, policy: Policy, where: str, model: object, tracked: set[str]
) -> tuple[str | None, list[str]]:
    """Validate one registry entry. Returns (name, files it registers)."""
    if not isinstance(model, dict):
        report.errors.append(f"{where}: must be a mapping")
        return None, []
    missing = [k for k in MODEL_REQUIRED if not str(model.get(k) or "").strip()]
    if missing:
        report.errors.append(f"{where}: missing {missing}")
        return None, []
    name = str(model["name"])
    for key in ("weights_license", "code_license"):
        _check_model_license(report, policy, name, key, str(model[key]))
    files = model.get("files") or []
    if not isinstance(files, list):
        report.errors.append(f"{where}: 'files' must be a list of repo paths")
        return name, []
    paths = [str(p) for p in files]
    for path in paths:
        if path not in tracked:
            report.errors.append(f"[model] {name}: file '{path}' is not tracked in git")
    return name, paths


def check_models(report: Report, policy: Policy, models_path: Path, files: list[str]) -> None:
    data = yaml.safe_load(models_path.read_text(encoding="utf-8")) or {}
    models = data.get("models") or []
    if not isinstance(models, list):
        report.errors.append(f"{models_path.name}: 'models' must be a list")
        return
    tracked = set(files)
    registered_files: set[str] = set()
    seen_names: set[str] = set()
    for i, model in enumerate(models):
        where = f"{models_path.name} models[{i}]"
        name, paths = _check_model_entry(report, policy, where, model, tracked)
        if name is not None:
            if name in seen_names:
                report.errors.append(f"{where}: duplicated name '{name}'")
            seen_names.add(name)
        registered_files.update(paths)
    for path in files:
        if Path(path).suffix.lower() in WEIGHT_EXTENSIONS and path not in registered_files:
            report.errors.append(
                f"[model] weights file '{path}' is committed but not in {models_path.name}"
            )
    report.checked["models"] = len(models)


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #


def emit(line: str) -> None:
    sys.stdout.write(line + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pnpm-json", type=Path, help="output of `pnpm licenses list --json`")
    parser.add_argument("--uv-lock", type=Path, default=REPO_ROOT / "uv.lock")
    parser.add_argument("--policy", type=Path, default=HERE / "policy.yaml")
    parser.add_argument("--models", type=Path, default=HERE / "models.yaml")
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    parser.add_argument("--skip-node", action="store_true", help="local use only")
    parser.add_argument("--skip-python", action="store_true", help="local use only")
    args = parser.parse_args(argv)

    policy = load_policy(args.policy)
    report = Report()

    if not args.skip_node:
        if args.pnpm_json is None:
            parser.error("--pnpm-json is required unless --skip-node is given")
        check_node(report, policy, json.loads(args.pnpm_json.read_text(encoding="utf-8")))
    if not args.skip_python:
        check_python(report, policy, args.uv_lock)
    check_models(report, policy, args.models, tracked_files(args.repo_root))

    checked = ", ".join(f"{k}: {v}" for k, v in report.checked.items())
    emit(f"License check ({checked})")
    for warning in report.warnings:
        emit(f"  warning: {warning}")
    for error in report.errors:
        emit(f"  ERROR: {error}")
    if report.errors:
        emit(
            f"\nFAILED: {len(report.errors)} problem(s). AGPL/GPL/SSPL code or weights cannot be "
            "distributed. Replace the dependency, or (for unknown licenses only after a human "
            "review) add an exception with approved_by in tests/licenses/policy.yaml."
        )
        return 1
    emit("OK: no AGPL/GPL/SSPL or unreviewed licenses found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
