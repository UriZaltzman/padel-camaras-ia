# ruff: noqa: T201  (CLI script: printing is its output)
"""Create the labels and issues described in issues.yaml with the GitHub CLI.

Usage (from the repo root, with `gh auth login` done):
    uv run --no-project --with pyyaml python .github/planning/create_issues.py --dry-run
    uv run --no-project --with pyyaml python .github/planning/create_issues.py --repo OWNER/NAME

Issues are created in dependency order, so every "Depende de" line links real issue numbers.
Already-created ids are remembered in created.json, so the script can be re-run after a failure.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any

import yaml

HERE = Path(__file__).resolve().parent
STATE_FILE = HERE / "created.json"

AGENT_COLORS = {
    "orquestador": "5319e7",
    "arquitecto": "0e8a16",
    "backend": "1d76db",
    "club-devops": "fbca04",
    "vision-ia": "d93f0b",
    "app-movil": "c5def5",
    "web-paneles": "bfdadc",
    "qa-seguridad": "b60205",
}
PHASES = {
    0: "Grabar partidos reales",
    1: "Grabación y plataforma",
    2: "IA y marcador",
    3: "Estadísticas y entrenador",
    4: "Piloto pago",
}
EXTRA_LABELS = {
    "feat": ("a2eeef", "Nueva funcionalidad"),
    "chore": ("ededed", "Estructura, configuración o coordinación"),
    "test": ("0052cc", "Pruebas"),
    "decision-needed": ("e99695", "Necesita decisión de una persona"),
    "phase-close": ("000000", "Cierre de fase de qa-seguridad"),
}


def topo_order(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {i["id"]: i for i in items}
    done: set[str] = set()
    ordered: list[dict[str, Any]] = []

    def visit(item_id: str) -> None:
        if item_id in done:
            return
        for dep in by_id[item_id]["deps"]:
            visit(dep)
        done.add(item_id)
        ordered.append(by_id[item_id])

    for item in items:
        visit(item["id"])
    return ordered


def render_body(item: dict[str, Any], numbers: dict[str, str]) -> str:
    deps = ", ".join(numbers[d] for d in item["deps"]) or "Ninguna"
    return (
        f"## Qué se construye\n\n{item['what']}\n\n"
        f"## Dónde está definido\n\n{item['spec']}\n\n"
        f"## Depende de\n\n{deps}\n\n"
        f"## Terminado cuando\n\n{item['done']}\n\n"
        f"---\nAgente: `{item['agent']}` · Fase {item['phase']} · Rama: "
        f"`{item['agent']}/<numero>-<titulo-corto>` · Plan: `{item['id']}`\n"
    )


def labels_for(item: dict[str, Any]) -> list[str]:
    return [
        f"agent:{item['agent']}",
        f"phase:{item['phase']}",
        item["type"],
        *item.get("labels", []),
    ]


def gh(*args: str) -> str:
    result = subprocess.run(["gh", *args], check=True, capture_output=True, text=True)  # noqa: S603, S607
    return result.stdout.strip()


def ensure_labels(repo: str) -> None:
    wanted = {f"agent:{a}": (c, f"Dueño: {a}") for a, c in AGENT_COLORS.items()}
    wanted |= {f"phase:{n}": ("c2e0c6", f"Fase {n}: {name}") for n, name in PHASES.items()}
    wanted |= EXTRA_LABELS
    for name, (color, description) in wanted.items():
        gh(
            "label",
            "create",
            name,
            "--repo",
            repo,
            "--color",
            color,
            "--description",
            description,
            "--force",
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", help="OWNER/NAME")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    items = yaml.safe_load((HERE / "issues.yaml").read_text(encoding="utf-8"))
    ordered = topo_order(items)

    if args.dry_run:
        numbers = {i["id"]: f"#{i['id']}" for i in items}
        for item in ordered:
            print(f"=== {item['title']}  {labels_for(item)}\n{render_body(item, numbers)}")
        print(f"{len(ordered)} issues")
        return

    if not args.repo:
        parser.error("--repo is required unless --dry-run")

    created: dict[str, str] = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
    ensure_labels(args.repo)
    for item in ordered:
        if item["id"] in created:
            continue
        url = gh(
            "issue",
            "create",
            "--repo",
            args.repo,
            "--title",
            item["title"],
            "--body",
            render_body(item, created),
            *[arg for label in labels_for(item) for arg in ("--label", label)],
        )
        created[item["id"]] = "#" + url.rsplit("/", 1)[-1]
        STATE_FILE.write_text(json.dumps(created, indent=2))
        print(f"{created[item['id']]}  {item['title']}")


if __name__ == "__main__":
    main()
