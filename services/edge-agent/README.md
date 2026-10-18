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

## Grabador (`edge-recorder`)

FFmpeg lee el RTSP de cada cámara y lo copia sin recomprimir (`-c copy`) en segmentos MPEG-TS de 10 s, cortados en múltiplos de 10 s del reloj (en el primer keyframe después de cada corte). La resolución y los cuadros por segundo (2560x1440 a 25) se configuran en la cámara; `edge-recorder probe` los verifica.

```bash
edge-recorder record --camera court-1-a --camera court-1-b --minutes 90   # arranca ya, para a los 90 + 2 min (o con Ctrl+C)
edge-recorder run --schedule horario.json      # graba cada turno del archivo con 2 min de margen antes y después
edge-recorder check --schedule horario.json    # continuidad de cada turno terminado (márgenes incluidos); sale con 1 si falta un segmento
edge-recorder check --camera court-1-a --from 2026-10-17T20:00:00-03:00 --to 2026-10-17T21:30:00-03:00
edge-recorder probe                            # cada cámara: arriba y en 2560x1440 a 25 fps
```

- Horario local (fase 0, a mano; después lo escribe el `scheduler`): `{"shifts": [{"id": "turno-1", "cameras": ["court-1-a", "court-1-b"], "start": "2026-10-17T20:00:00-03:00", "end": "2026-10-17T21:30:00-03:00"}]}`. Las horas llevan su desfase de UTC. `run` relee el archivo cuando cambia; si queda inválido, sigue con la última versión buena. Turnos pegados se graban como un solo tramo, sin cortar FFmpeg.
- Segmentos en `<segments_dir>/<cámara>/<cámara>-<AAAAMMDDTHHMMSSZ>.ts` (hora UTC en que abrió). Cada segmento cerrado queda en la tabla `segments` de la base local (UUID v7, cámara, ruta, inicio, duración, tamaño).
- Si FFmpeg se cae (cámara sin luz, 5 s sin datos), se reinicia con espera creciente de 1 a 10 s. `check` muestra el hueco que quedó.
- Las URLs de las cámaras pueden llevar usuario y contraseña: nunca se escriben en el log, y la salida de FFmpeg pasa por `redact_credentials` antes de loguearse.

| Variable                     | Obligatoria                    | Default                            |
| ---------------------------- | ------------------------------ | ---------------------------------- |
| `EDGE_RECORDER_CAMERAS`      | sí para `record`/`run`/`probe` | JSON `{"court-1-a": "rtsp://..."}` |
| `EDGE_RECORDER_SEGMENTS_DIR` | no                             | `EDGE_DATA_DIR/segments`           |
| `EDGE_RECORDER_FFMPEG_BIN`   | no                             | `ffmpeg`                           |
| `EDGE_RECORDER_FFPROBE_BIN`  | no                             | `ffprobe`                          |

También necesita las variables `EDGE_*` del agente. `tests/test_recorder_integration.py` graba el simulador con FFmpeg y mediamtx de verdad; si no están instalados se saltea diciendo cuál falta.

## Comandos

```bash
uv run pytest
uv run ruff format --check . && uv run ruff check .
uv run mypy --config-file ../../packages/config/mypy.ini .
# Imagen (desde la raíz del repo):
docker build -f services/edge-agent/Dockerfile -t edge-agent .
```
