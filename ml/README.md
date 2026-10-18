# ml

Dueño: `vision-ia`.

Pipeline de visión (sección 5), marcador (sección 6), estadísticas (sección 7) y entrenamiento (sección 8). Los umbrales viven solo en `config/thresholds.yaml`. Ver `.claude/agents/vision-ia.md`.

## Estructura

- `config/thresholds.yaml`: todos los umbrales. `ml.thresholds.load_thresholds()` los valida al arrancar (falta una clave, sobra una o tiene el tipo equivocado: error).
- `src/ml/schemas.py`: registros tipados que pasan de una etapa a otra (detecciones, pistas, pelota, golpes, botes).
- `src/ml/parquet_io.py`: `write_stage` / `read_stage` guardan y leen la salida de cada etapa en `<carpeta>/<etapa>.parquet`.
- `src/ml/labels.py`: etiquetas humanas de la sección 8 (golpes, botes con superficie, tipo de golpe y puntos con ganador y motivo de fin). Se guardan por partido y por versión en `<raíz>/<match_id>/v<versión>/` con `write_label_set` / `read_label_set`; una versión guardada no se pisa.
- `tests/test_no_magic_numbers.py`: falla si aparece un número distinto de 0 o 1 en `src/`.
