# Motor de punto y marcador: qué hace y cuánto acierta

Issues #130 a #134 y #138. Texto en español rioplatense con los nombres de código en inglés. Manda `docs/especificacion-tecnica.md` §6; las reglas dudosas están en `docs/ml/rules-ambiguities.md`.

## Qué es

Una función pura de eventos: recibe los golpes y piques (con superficie, mitad de la cancha y confianza) y devuelve los puntos con ganador, motivo, confianza y marca de revisión, más el marcador corrido. No toca video ni modelos, así que se prueba entero con eventos simulados antes de tener partidos reales.

| Pieza | Dónde | Issue |
| --- | --- | --- |
| Máquina de estados con las 7 reglas, en orden | `ml/src/ml/point/machine.py` | #130 |
| Marcador, rotación del saque y cambios de lado | `ml/src/ml/scoring.py`, `ml/src/ml/point/state.py` | #131 |
| Capa 1: coherencia del saque | `ml/src/ml/point/align.py` | #132 |
| Capa 2: confianza por punto y marca de revisión (< 0,7) | `machine.py`, `pipeline.py`, `contract.py` | #133 |
| Capa 3: alineamiento (Viterbi) al resultado cargado | `align.py`, `pipeline.py` | #134 |
| Casos de reglas escritos a mano | `tests/rules/*.yaml` | #138 |
| Simulador de partidos con ruido | `ml/tests/simulator.py` | todos |

El orden de uso es `analyze(events, setup, fmt, thresholds, final=...)` en `ml/src/ml/point/pipeline.py`. Todos los números (tiempos de espera, costos del alineamiento, ancho del haz) están en `ml/config/thresholds.yaml`, secciones `point` y `scoring`.

## Cómo funcionan las capas

1. **Reglas.** La máquina lee los eventos en orden y cierra el punto con la primera regla que se cumple. Un cierre es provisorio durante `reopen_window_s`: si después hay un golpe, el evento que lo cerró estaba mal leído y el rally sigue. La pareja de cada lado se decide por votación de los golpes del punto.
2. **Capa 1.** Se busca la edición más barata de la lista de ganadores (dar vuelta un ganador, borrar un punto que no existió o agregar uno que no se vio) para que el sacador de cada punto coincida con la rotación. Dar vuelta un punto cuesta `-ln(1 - confianza)`: los dudosos se corrigen primero. Un sacador mal leído no se prohíbe, cuesta `server_mismatch_cost`.
3. **Capa 2.** La confianza de un punto es el producto de las confianzas de los eventos que lo deciden, por un factor menor a 1 cada vez que la máquina tuvo que suponer un evento que no vio (y 0,5 si el punto salió por pelota perdida). Menos de 0,7 se marca para revisión. Los puntos que cambió una capa también se marcan.
4. **Capa 3.** Mismo alineamiento, pero además el partido tiene que terminar en el resultado cargado. Si no hay manera de llegar a ese resultado con los eventos que hay, se arma el partido más corto que llega y todos sus puntos quedan marcados. Cada cambio queda en `MatchResult.corrections` (capa, tipo, punto, ganador antes y después, costo) para reentrenar.

## Cómo se midió

`ml/tests/simulator.py` juega partidos completos con el marcador y la rotación reales (punto de oro o ventaja y super tie-break al azar), con saques, faltas, rallies con paredes y contrapared, y todos los finales de punto de §6. Después le agrega ruido a los eventos con una tasa por evento:

- piques que no se ven (`missed_bounce`) y golpes que no se ven (`missed_shot`, la mitad de la tasa)
- superficie equivocada (`wrong_surface`), también el cuadro de saque
- golpe atribuido al jugador equivocado (`wrong_attribution`: 70 % al compañero, 30 % a un rival)
- pelota perdida entre 4,5 y 8 segundos (`ball_lost`, probabilidad por punto)

Un punto está bien si el punto previsto que más se superpone en el tiempo tiene el mismo ganador. El resultado cargado es el verdadero.

Resultados con 40 partidos simulados por nivel (semillas 1000 a 1039; `uv run python tests/score_engine_report.py 40` en `ml/`):

| Noise per event | Stage | Points with the right winner | Final score exact | Wrong points flagged | Points flagged |
| --- | --- | --- | --- | --- | --- |
| 0% | raw (7 rules) | 100.0% | 40/40 | n/a | 9% |
| 0% | + layer 1 | 100.0% | 40/40 | n/a | 9% |
| 0% | + layers 1-3 | 100.0% | 40/40 | n/a | 9% |
| 2% | raw (7 rules) | 97.2% | 9/40 | 48% | 24% |
| 2% | + layer 1 | 97.2% | 32/40 | 50% | 24% |
| 2% | + layers 1-3 | 97.3% | 40/40 | 50% | 24% |
| 5% | raw (7 rules) | 93.2% | 2/40 | 59% | 42% |
| 5% | + layer 1 | 92.8% | 22/40 | 61% | 42% |
| 5% | + layers 1-3 | 92.7% | 40/40 | 61% | 42% |
| 10% | raw (7 rules) | 86.5% | 2/40 | 71% | 60% |
| 10% | + layer 1 | 84.7% | 11/40 | 69% | 60% |
| 10% | + layers 1-3 | 84.7% | 40/40 | 69% | 60% |

"Final score exact" cuenta los partidos cuyo resultado final coincide set por set. "Wrong points flagged" es el porcentaje de puntos mal resueltos que quedan marcados para revisión. En la tabla "+ layers 1-3" incluye la capa 2 (que no cambia ganadores, solo marca).

## Qué dicen los números (y qué no)

- Con 5 % de ruido el 93 % de los puntos sale bien con las reglas solas. **Las capas no mejoran los ganadores punto a punto** (92,7 % al final): corrigen el marcador, que es lo que ve el jugador. Sin la capa 1 el resultado final es exacto en 2 de 40 partidos con 5 % de ruido; con la capa 1 en 22 de 40; con el resultado cargado, en 40 de 40 siempre, porque la capa 3 lo garantiza por construcción.
- Un punto mal resuelto dentro de un game que igual lo gana la misma pareja no cambia ni el saque ni el resultado: ninguna capa lo puede detectar. Para eso está la capa 2: marca el 61 % de los puntos mal resueltos con 5 % de ruido, a costa de revisar el 42 % de los puntos. Con 0 % de ruido marca el 9 % de puntos que están bien, porque el producto de 3 o 4 confianzas de 0,93 ya baja de 0,7 en rallies largos. Conviene revisar si 0,7 es el umbral correcto cuando haya confianzas reales.
- Los parámetros de ruido y de confianza son supuestos míos: un error de detección tiene confianza baja el 65 % de las veces y normal el resto (para que haya errores que la confianza no ve). Con partidos reales hay que recalibrar. Los costos del alineamiento casi no mueven los resultados (se probó una grilla de 27 combinaciones, ±1 punto).
- Se probó con la regla de pelota perdida `hitter_loses`; con `hitter_wins` no se midió.

## Umbrales de aceptación en los tests (`ml/tests/test_score_engine.py`)

Con 8 partidos fijos por nivel: ganadores correctos después de las capas 1 a 3 ≥ 100 % / 95 % / 90 % / 80 % con 0 / 2 / 5 / 10 % de ruido; solo con las reglas ≥ 100 / 94 / 88 / 78 %; las capas no empeoran los ganadores en más de 2 puntos; un resultado cargado se reproduce siempre; la capa 1 recupera más resultados que las reglas solas con ruido de 2, 5 y 10 %; la capa 2 marca al menos la mitad de los puntos mal resueltos con 5 %.
