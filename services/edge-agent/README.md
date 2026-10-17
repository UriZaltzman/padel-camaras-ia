# services/edge-agent

Dueño: `club-devops`.

Los 7 procesos del agente del club (sección 4) y el simulador de cámaras. Ver `.claude/agents/club-devops.md`.

## Configuración

Variables de entorno, validadas al arrancar (`src/edge_agent/settings.py`). Si falta una obligatoria, el agente no arranca, sale con código 2 y dice cuál falta.

| Variable            | Obligatoria | Default               |
| ------------------- | ----------- | --------------------- |
| `EDGE_CLUB_ID`      | sí (UUID)   |                       |
| `EDGE_DEVICE_ID`    | sí (UUID)   |                       |
| `EDGE_API_BASE_URL` | sí (URL)    |                       |
| `EDGE_DATA_DIR`     | no          | `/var/lib/edge-agent` |
| `EDGE_LOG_LEVEL`    | no          | `INFO`                |

## Logs y base local

- Logs JSON por stdout con `request_id`, `club_id` y `match_id` (`log_context`). Los campos con nombre sensible (token, email, teléfono, etc.) salen como `[REDACTED]`, pero la regla es no loguearlos nunca.
- SQLite en `EDGE_DATA_DIR/edge-agent.sqlite3`, en modo WAL, con migraciones por `PRAGMA user_version`.

## Comandos

```bash
uv run pytest
uv run ruff format --check . && uv run ruff check .
uv run mypy --config-file ../../packages/config/mypy.ini .
# Imagen (desde la raíz del repo):
docker build -f services/edge-agent/Dockerfile -t edge-agent .
```
