# Plataforma de cámaras con IA para clubes de pádel

El nombre de la marca es provisorio y vive solo en `packages/config/brand.ts` y `brand.py`.

Empezá por [`CLAUDE.md`](CLAUDE.md) (reglas, convenciones y dueños de cada carpeta) y por los documentos que mandan en [`docs/`](docs/).

## Requisitos

- Node 22 y pnpm 9 (`corepack enable`)
- uv (Python 3.12 lo instala uv)
- Docker, para PostgreSQL 16 y Redis

## Comandos

```bash
pnpm install
docker compose up -d
pnpm lint && pnpm typecheck && pnpm test
uv sync
uv run --directory packages/config pytest
```
