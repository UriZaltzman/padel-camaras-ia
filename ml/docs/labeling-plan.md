# Plan de etiquetado y holdout de evaluación

Issue #17 · Especificación §8 (actualizada por ADR 0002) · Depende de #12.

Este plan dice qué se etiqueta, cuánto, con qué herramienta, en qué orden y cómo se controla la calidad. Los 15 partidos de evaluación están en `ml/config/holdout.yaml`, y el código de entrenamiento tiene que llamar a `ml.holdout.assert_no_holdout_in_training` antes de entrenar.

## 1. De dónde salen los datos

- **Videos existentes** (ADR 0002, relevamiento en `ml/docs/datasets.md`): sirven para el preentrenamiento. Solo entran fuentes aprobadas por una persona, con licencia que permita uso comercial y entrenamiento. Si traen etiquetas compatibles se reutilizan; si no, se etiquetan con las mismas herramientas de este plan.
- **Partidos propios de ajuste fino**: 20 a 30 partidos grabados con nuestras 2 cámaras. Se usan para ajustar y para medir durante el desarrollo.
- **Holdout**: 15 partidos propios **distintos** de los de ajuste fino. Nunca se etiquetan para entrenar, solo para medir. En total la fase 0 graba entre 35 y 45 partidos propios.

## 2. Cantidades por tipo de etiqueta (partidos propios)

| Dato | Herramienta | Cantidad para la primera versión | Holdout (solo medir) |
| --- | --- | --- | --- |
| Recuadros de jugadores | CVAT, con pre-etiquetado del detector genérico (YOLOX/RT-DETR, Apache 2.0) | 5.000 cuadros de 20 a 30 partidos | 1.500 cuadros (100 por partido) |
| Posición de la pelota | CVAT, un punto por cuadro (o "no visible") | 30.000 cuadros de 20 partidos | 7.500 cuadros (500 por partido) |
| Golpes y botes con superficie | Herramienta propia (`ml/src/ml/labeling`), sobre la línea de tiempo | 20 partidos completos | 15 partidos completos |
| Tipo de golpe | Herramienta propia, clips de 1 segundo | 3.000 golpes, al menos 150 por cada una de las 10 clases | Todos los golpes de los 15 partidos |
| Ganador de cada punto | Herramienta propia | 20 a 30 partidos (los de la fase 0) | 15 partidos completos |
| Puntos de calibración | Herramienta de calibración (12 puntos por cámara) | 1 vez por cancha y cámara | 1 vez por cancha y cámara |

Notas:

- Los cuadros se muestrean repartidos a lo largo de todo el partido, no seguidos, para no tener cuadros casi iguales. Para la pelota se etiquetan tramos cortos seguidos porque TrackNetV3 usa 3 cuadros.
- Si alguna clase de tipo de golpe no llega a 150 ejemplos con los partidos propios, se completa con videos existentes aprobados antes de grabar más partidos.
- Los golpes y botes con superficie se etiquetan solo sobre partidos propios: dependen de nuestras 2 cámaras y del plano de vidrios y rejas.

## 3. Mezcla de día y noche, y de canchas

- **Día y noche**: al menos el 40 % de los cuadros y partidos de cada tipo de etiqueta es de noche (luz artificial), y al menos el 40 % de día. El resto se reparte según lo que se grabe.
- **Canchas**: al menos 2 canchas distintas (idealmente de 2 clubes), para que el modelo no aprenda un vidrio o una luz en particular.
- **Holdout**: las reglas de mezcla (`min_day_matches`, `min_night_matches`, `min_distinct_courts`) están en `ml/config/holdout.yaml`; `HoldoutRegistry.missing_requirements()` dice qué falta.
- **Nivel de juego**: se busca mezclar niveles (principiante, intermedio, avanzado), porque cambian la velocidad de la pelota y el tipo de golpes.

## 4. Qué nunca se etiqueta ni entra al entrenamiento

- Partidos donde algún jugador eligió "no usar mis videos para entrenar". Se verifica contra la base de datos en el momento de armar cada lote de etiquetado y otra vez al armar el set de entrenamiento (el permiso puede cambiar).
- Videos existentes donde se pueda identificar a un jugador que pidió no usarse.
- Partidos con menores sin permiso del adulto responsable.
- Fuentes con licencia AGPL, GPL, no comercial o poco clara, y fuentes no aprobadas en `ml/docs/datasets.md`.
- Ninguna etiqueta de caras ni de identidad facial.
- Los 15 partidos del holdout, para entrenamiento y ajuste fino. El guard lanza `HoldoutLeakError` si aparece alguno.

Si un jugador retira el permiso después de etiquetado, sus partidos salen del siguiente entrenamiento y las etiquetas se borran.

## 5. Orden de trabajo

1. **Calibración** de cada cancha grabada (requisito para botes y posiciones en metros).
2. **Elegir y congelar el holdout**: a medida que se graban partidos, se asignan al holdout hasta completar los 15 con la mezcla pedida, antes de etiquetar nada para entrenar. Así ninguna decisión de entrenamiento se toma mirando esos partidos.
3. **Recuadros de jugadores** (CVAT con pre-etiquetado): es lo más rápido y desbloquea el seguimiento.
4. **Ganador de cada punto** y **golpes y botes** con la herramienta propia: desbloquean la máquina de estados del punto.
5. **Posición de la pelota** (CVAT): es lo más largo; se hace en paralelo desde el paso 3.
6. **Tipo de golpe** sobre los golpes ya marcados en el paso 4.
7. **Etiquetado del holdout** (mismo orden), con doble etiquetado completo (ver sección 6).
8. Las correcciones de jugadores en la app entran a la cola de revisión y, validadas, al siguiente entrenamiento (nunca si son del holdout).

## 6. Control de calidad

- **Doble etiquetado**: el 10 % de cada tipo de etiqueta de entrenamiento lo etiquetan 2 personas por separado. El holdout se etiqueta completo dos veces y las diferencias las resuelve una tercera persona.
- **Métricas de acuerdo** (sobre la muestra doble):

| Dato | Métrica de acuerdo | Mínimo |
| --- | --- | --- |
| Recuadros de jugadores | IoU promedio entre recuadros emparejados | 0,85 |
| Pelota | Puntos a menos de 5 píxeles, y acuerdo en "visible / no visible" | 90 % |
| Golpes | Mismo golpe a menos de 100 ms | 95 % |
| Botes y superficie | Kappa de Cohen sobre la superficie | 0,80 |
| Tipo de golpe | Kappa de Cohen sobre las 10 clases | 0,75 |
| Ganador del punto | Coincidencia exacta | 99 % |

- Si un lote no llega al mínimo, se revisa la guía con los etiquetadores y se vuelve a etiquetar ese lote.
- Cada lote guarda quién lo etiquetó, la versión de la guía y la fecha, para rastrear qué datos entraron a cada modelo (MLflow).
- Revisión al azar: una persona revisa el 5 % de cada lote antes de aceptarlo.

## 7. Estimación de tiempos

Estimaciones por persona, a confirmar midiendo los primeros lotes:

| Dato | Ritmo estimado | Entrenamiento | Holdout | Horas totales |
| --- | --- | --- | --- | --- |
| Recuadros de jugadores (con pre-etiquetado) | 120 cuadros por hora | 5.000 cuadros: 42 h | 1.500 x 2: 25 h | 67 h |
| Pelota | 300 cuadros por hora | 30.000 cuadros: 100 h | 7.500 x 2: 50 h | 150 h |
| Golpes y botes | 1,5 h por partido de 1 hora | 20 partidos: 30 h | 15 x 2: 45 h | 75 h |
| Tipo de golpe | 400 clips por hora | 3.000 golpes: 8 h | unos 9.000 x 2: 45 h | 53 h |
| Ganador del punto | 15 min por partido | 30 partidos: 8 h | 15 x 2: 8 h | 16 h |
| Calibración | 15 min por cámara | — | — | 2 h |
| Doble etiquetado del 10 % y revisión | — | 20 h | — | 20 h |

Total aproximado: **380 horas-persona**. Con 3 etiquetadores a 20 horas semanales, unas 6 a 7 semanas desde que estén grabados los partidos.

## 8. Herramientas

- **CVAT** (`ml/docs/cvat.md`, `ml/src/ml/cvat.py`): recuadros y puntos cuadro por cuadro, con pre-etiquetado importado.
- **Herramienta propia** (`ml/src/ml/labeling`, configuración en `ml/config/labeling.yaml`): eventos sobre la línea de tiempo (golpes, botes con superficie, tipo de golpe, ganador del punto), que en CVAT serían muy lentos.

## 9. Holdout versionado

- Archivo: `ml/config/holdout.yaml`. Hoy la lista está vacía; se completa a medida que se graban los partidos, por id del partido en la plataforma.
- Una vez agregado un partido, no se quita. Si hay que cambiar uno, se sube `version` y las métricas de versiones anteriores dejan de compararse.
- Loader tipado: `ml.holdout.load_holdout()`. Guard obligatorio: `ml.holdout.assert_no_holdout_in_training(match_ids)`.
- Un modelo solo se instala en los clubes si iguala o mejora todas las métricas de §8 sobre estos 15 partidos.
