# ml

Dueño: `vision-ia`.

Pipeline de visión (sección 5), marcador (sección 6), estadísticas (sección 7) y entrenamiento (sección 8). Los umbrales viven solo en `config/thresholds.yaml`. Ver `.claude/agents/vision-ia.md`.

## Estructura

- `config/thresholds.yaml`: todos los umbrales. `ml.thresholds.load_thresholds()` los valida al arrancar (falta una clave, sobra una o tiene el tipo equivocado: error).
- `src/ml/schemas.py`: registros tipados que pasan de una etapa a otra (detecciones, pistas, pelota, golpes, botes).
- `src/ml/parquet_io.py`: `write_stage` / `read_stage` guardan y leen la salida de cada etapa en `<carpeta>/<etapa>.parquet`.
- `tests/test_no_magic_numbers.py`: falla si aparece un número distinto de 0 o 1 en `src/`.
