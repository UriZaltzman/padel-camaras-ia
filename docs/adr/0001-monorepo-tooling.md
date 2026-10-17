# 0001. Herramientas del monorepo

Fecha: 2026-10-17 · Estado: propuesta (la aprueba una persona al mergear el PR de bootstrap)

## Contexto

La sección 1 de la especificación pide un solo repositorio con TypeScript estricto para producto y Python tipado para IA y el equipo del club, y que cada PR corra formato, tipos, pruebas y compilación de lo que toca.

## Decisión

- **TypeScript:** pnpm workspaces + Turborepo. Los paquetes internos usan el scope neutro `@app/` para no escribir el nombre de la marca.
- **Python:** un workspace de uv con `packages/config` (espejo `brand.py`), `services/edge-agent` y `ml`. Python 3.12.
- **Config compartida:** `packages/config` tiene `tsconfig.base.json`, ESLint (flat config), Prettier, `ruff.toml` y `mypy.ini`.
- **CI:** `.github/workflows/ci.yml` usa `turbo --filter=...[origin/<base>]` para TypeScript y filtros por ruta para Python, así cada PR solo corre lo que cambió (y lo que depende de eso).
- **Documentos fuente** (`docs/`, `CLAUDE.md`, `.claude/`) quedan fuera de Prettier para no reformatear lo aprobado.

## Consecuencias

Cada agente crea el `package.json` o `pyproject.toml` de su carpeta con las herramientas de su stack, extendiendo la config de `packages/config`. Turbo ignora los paquetes que no definen una tarea.
