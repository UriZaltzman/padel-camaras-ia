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

## Simulador de cámaras (`edge-camsim`)

Publica videos grabados como streams RTSP, 2 por cancha (`court-<n>-a` y `court-<n>-b`), para probar el `recorder`, el `clipper` y el `health` sin cámaras. FFmpeg empuja cada video en loop, sin recomprimir, a un servidor RTSP ([mediamtx](https://github.com/bluenviron/mediamtx), licencia MIT); los dos corren como procesos separados.

```bash
docker compose -f infra/camsim/docker-compose.yml up -d --build      # desde la raíz del repo
CAMSIM_COURTS=4 docker compose -f infra/camsim/docker-compose.yml up -d --build
docker compose -f infra/camsim/docker-compose.yml exec camsim edge-camsim list
docker compose -f infra/camsim/docker-compose.yml exec camsim edge-camsim probe   # ffprobe a cada cámara
docker compose -f infra/camsim/docker-compose.yml exec camsim edge-camsim stop court-1-a   # cámara caída
docker compose -f infra/camsim/docker-compose.yml exec camsim edge-camsim start court-1-a
```

- Streams en `rtsp://localhost:8554/court-<n>-<a|b>` desde la máquina, o `rtsp://mediamtx:8554/...` desde otro contenedor de la red `camsim_default`.
- Videos: `infra/camsim/videos/<camara>.mp4` para una cámara o `default.mp4` para todas. Nunca se suben al repo. Si no hay, se genera uno sintético con `testsrc` de FFmpeg (2560x1440, 25 fps) la primera vez.
- `edge-camsim stop` deja la cámara apagada hasta el `start`, aunque se reinicie el contenedor. Una cámara apagada desaparece del servidor RTSP, como una cámara sin luz.
- `edge-camsim generate-test-video salida.mp4 --size 1280x720 --seconds 10` genera un video sintético a mano.

| Variable                     | Default                      | Para qué                                        |
| ---------------------------- | ---------------------------- | ----------------------------------------------- |
| `CAMSIM_COURTS`              | `2`                          | Canchas simuladas (1 a 16)                      |
| `CAMSIM_RTSP_URL`            | `rtsp://localhost:8554`      | Servidor RTSP donde publican las cámaras        |
| `CAMSIM_ADVERTISED_RTSP_URL` | igual a `CAMSIM_RTSP_URL`    | URL que muestra `list` (en Docker, la del host) |
| `CAMSIM_VIDEO_DIR`           | `/videos`                    | Videos grabados                                 |
| `CAMSIM_STATE_DIR`           | `/var/lib/edge-agent/camsim` | Cámaras apagadas y video sintético generado     |
| `CAMSIM_FFMPEG_BIN`          | `ffmpeg`                     |                                                 |
| `CAMSIM_FFPROBE_BIN`         | `ffprobe`                    |                                                 |
| `CAMSIM_TEST_VIDEO_SIZE`     | `2560x1440`                  | También `CAMSIM_TEST_VIDEO_FPS` y `_SECONDS`    |
| `CAMSIM_LOG_LEVEL`           | `INFO`                       |                                                 |

Las pruebas de `tests/test_camsim_integration.py` usan FFmpeg, ffprobe, mediamtx y Docker de verdad; si alguno no está instalado se saltean diciendo cuál falta.

## Comandos

```bash
uv run pytest
uv run ruff format --check . && uv run ruff check .
uv run mypy --config-file ../../packages/config/mypy.ini .
# Imagen (desde la raíz del repo):
docker build -f services/edge-agent/Dockerfile -t edge-agent .
```
