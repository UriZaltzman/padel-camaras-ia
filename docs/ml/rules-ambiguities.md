# Reglas del pádel que las fuentes no cierran

Cierra la parte de reglas de los issues #130, #131 y #138. Texto en español rioplatense con los nombres de código en inglés, como el resto de `docs/`. Manda `docs/especificacion-tecnica.md` §6; esto lista dónde la especificación calla, es ambigua o puede diferir del reglamento oficial.

**Cómo se usa.** Cada ambigüedad es una opción con nombre en `RuleOptions` (`ml/src/ml/point/rules.py`). El valor por defecto sigue la especificación al pie de la letra. Para cambiar una decisión se cambia el valor de la opción, no el algoritmo, y hay un caso de `tests/rules/point_rules.yaml` que fija cada comportamiento. **Nadie del equipo tiene el reglamento FIP a mano en este repo: la columna "Qué dice el reglamento" es lo que creemos y hay que verificarlo contra el texto oficial antes de darlo por cerrado.**

## Para decidir (dueño del producto)

| Id | Situación | Opción | Por defecto (especificación) | Qué dice el reglamento (verificar) | Casos |
| --- | --- | --- | --- | --- | --- |
| A1 | El saque toca la red y cae en el cuadro correcto | `serve_net_contact` = `fault` / `let` | `fault` (§6 regla 1: "toca la red") | Creemos que es "let": se repite el saque sin falta | `serve-touches-net-*`, `serve-net-let-option-*` |
| A2 | El saque pica en el cuadro y después toca el vidrio o la reja | `serve_fault_walls` (conjunto de superficies) | solo `fence` (§6 regla 1: "pega en la reja") | Creemos que el vidrio es válido y la reja es falta | `serve-hits-fence-after-bounce-*`, `serve-hits-glass-after-bounce-is-good`, `fence-option-off-*` |
| A3 | La pelota golpeada toca la pared propia antes de cruzar la red (contrapared) | `contrapared_valid` | `true` (§6: "es válido... siempre que después cruce y pique en el piso rival") | A confirmar: en algunas versiones del reglamento tocar la pared propia después del golpe es falta | `contrapared-*`, `side-contrapared-is-valid`, `own-wall-then-own-floor-*` |
| A4 | En el juego, la pelota toca la red y igual cruza | `net_cord_valid_in_rally` | `true` (la especificación solo habla de "no la cruza") | Es válida | `net-cord-*` |
| A5 | Después de picar en el piso rival toca el vidrio o la reja y sigue | `wall_after_rival_floor_valid` | `true` (es la "salida de pared") | Es válida, tanto vidrio como reja | `rival-floor-then-wall-*`, `rival-wall-option-off-*` |
| A6 | Rally cortado: se vio un golpe y nunca más la pelota (regla 7 con último evento un golpe) | `lost_after_shot` = `hitter_loses` / `hitter_wins` | `hitter_loses` (la especificación dice "por el último evento válido", pero no cuál de los dos) | No hay regla: es un recurso nuestro, el punto sale con confianza baja y se revisa | `ball-never-seen-after-a-shot-*` |
| A7 | La pelota golpeada sale de la cancha sin picar en el piso rival | `out_before_floor_loses_hitter` | `true` (regla 4 extendida a "afuera") | Pierde el que golpeó | `crossed-ball-leaves-the-court-*`, `out-before-bounce-*` |
| A10 | Un golpe que el clasificador no marcó como `serve` abre un punto | `open_point_without_serve_flag` | `false` (§6: "un saque válido abre el rally") | No aplica (es de detección) | — |
| A11 | Cómo se carga un super tie-break en el resultado final | `FinalScore.sets` | un set ganado 1-0 (como lo guarda `ml.scoring`) | Se juega a 10 puntos y en el marcador oficial suele escribirse 10-8 | `ml/src/ml/point/pipeline.py` |

## Decisiones de implementación que no son del reglamento

Estas no cambian lo que dice el reglamento, pero sí lo que el sistema decide cuando falla la detección. Todas están en `ml/config/thresholds.yaml`, sección `point`.

| Id | Qué hace | Umbral | Por qué |
| --- | --- | --- | --- |
| A8 | Si tras una "falta de saque" el rival devuelve la pelota, el saque se toma por bueno (se leyó mal el pique) | `receiver_hit_overrides_serve_fault` (opción) | Una falta no se juega: si el rival la golpea, la pelota estaba en juego |
| A9 | Si el rival devuelve el saque y no se vio ningún pique, se asume pique bueno | `serve_without_bounce_is_good` (opción) | Mismo razonamiento; la confianza del punto baja |
| A12 | Un punto "cerrado" por una regla es provisorio: si dentro de `reopen_window_s` (2,5 s) hay un golpe, se ignora el evento que lo cerró y el rally sigue | `point.reopen_window_s` | La pelota no se golpea después de terminada la jugada; un golpe significa que el pique o la superficie se leyó mal |
| A13 | Un golpe que no es saque después de `new_point_gap_s` (10 s) de silencio abre un punto "a mitad de rally" sin saque conocido | `point.new_point_gap_s` | Si no se vio el saque, el punto igual existe; la capa 1 no lo puede controlar porque no hay sacador |
| A14 | Cuál es la pareja de cada lado se decide por votación de los golpes del punto, no por el primero | (código) | Un golpe mal atribuido al rival no puede dar vuelta el punto entero |

## Lo que el motor no cubre (reglas del reglamento sin detector)

Ninguna de estas llega a `PointEndReason`: hoy se resuelven por la regla 7 o quedan como error que corrige un jugador al revisar.

- La pelota pega a un jugador (la pareja que la recibe pierde el punto). Hace falta el contacto cuerpo-pelota de la etapa de poses.
- Doble golpe, golpe con la paleta fuera de su zona, invasión de la red o toque de la red con la paleta o el cuerpo.
- Lesión o juego detenido. `PointEndReason.OTHER` existe para estos casos pero el contrato (`ResultPoint.end_reason`) no tiene `other`: se informa como `ball_lost`.
- Saque en el momento equivocado (la pareja saca desde el lado incorrecto o antes de que el rival esté listo).
- Pelota que toca el techo o la iluminación de la cancha.
- Cuál de las dos alturas de la reja cuenta como "reja" y cuál como "vidrio" en canchas con construcciones mixtas: la especificación (§5.8) dice que sale del plano de vidrios y rejas de cada cancha; si el plano está mal cargado, A2 y A5 se aplican al revés.
- La puerta de la cancha se trata como `out` (§6 regla 6).

## Marcador

`ml/src/ml/scoring.py` y `ml/src/ml/point/state.py` implementan lo que dice la especificación. Puntos que conviene confirmar:

- **Saque en el tie-break.** El primero saca un punto y después cada jugador saca dos, en el orden normal de saque (A1, B1, A2, B2). El set siguiente lo empieza a sacar la pareja que recibió primero en el tie-break. Implementado así (`tiebreak_serve_run_points`).
- **Cambios de lado.** Después del primer game y luego cada dos; en el tie-break cada 6 puntos y una vez más al terminarlo (`side_change_every_games`, `tiebreak_side_change_points`).
- **Super tie-break.** Se rota y se cambia de lado igual que un tie-break, a 10 puntos con 2 de diferencia.
- **Punto de oro.** Quien resta elige el lado: no cambia el ganador y no se modela.
- **Resultado final inválido.** Si el jugador carga un resultado imposible (por ejemplo un set 6-5 terminado) la capa 3 arma el partido más corto posible que llega a ese número y marca todos los puntos para revisión; la app debería validar el resultado antes (pendiente del backend).
