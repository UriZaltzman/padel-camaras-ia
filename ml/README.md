# ml

Dueño: `vision-ia`.

Pipeline de visión (sección 5), marcador (sección 6), estadísticas (sección 7) y entrenamiento (sección 8). Los umbrales viven solo en `config/thresholds.yaml`. Ver `.claude/agents/vision-ia.md`.

## Estructura

- `config/thresholds.yaml`: todos los umbrales. `ml.thresholds.load_thresholds()` los valida al arrancar (falta una clave, sobra una o tiene el tipo equivocado: error).
- `src/ml/schemas.py`: registros tipados que pasan de una etapa a otra (detecciones, pistas, pelota, golpes, botes).
- `src/ml/parquet_io.py`: `write_stage` / `read_stage` guardan y leen la salida de cada etapa en `<carpeta>/<etapa>.parquet`.
- `src/ml/labels.py`: etiquetas humanas de la sección 8 (golpes, botes con superficie, tipo de golpe y puntos con ganador y motivo de fin). Se guardan por partido y por versión en `<raíz>/<match_id>/v<versión>/` con `write_label_set` / `read_label_set`; una versión guardada no se pisa.
- `tests/test_no_magic_numbers.py`: falla si aparece un número distinto de 0 o 1 en `src/`.

## Herramienta de etiquetado (golpes y botes)

`src/ml/labeling/`: página local para marcar golpes y botes con su superficie sobre la línea de tiempo de un video, con atajos de teclado. Sirve con cualquier video de una sola cámara (también partidos que ya tenemos grabados).

```bash
uv run --directory ml python -m ml.labeling /ruta/al/partido.mp4 --labels-root /ruta/a/etiquetas
```

Abrí la dirección que muestra la terminal. Los atajos están en `config/labeling.yaml` y se listan en la página. Al guardar se escribe una versión nueva con `write_label_set` (nunca se pisa una anterior); si el partido ya tenía etiquetas, se arranca desde la última versión. El id del partido se asigna por video en `<etiquetas>/videos.json` (o pasalo con `--match-id`) y el id del etiquetador es un UUID v7 guardado en `~/.config/ml-labeling/labeler_id` (o `--labeler`). Los textos están en `src/ml/labeling/locales/es-AR.json`.
