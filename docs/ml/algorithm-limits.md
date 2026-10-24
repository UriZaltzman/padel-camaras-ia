# Límites de los algoritmos de geometría y eventos

Lo que estos algoritmos no pueden hacer (todavía), con el nivel de ruido en el que se rompen. Se midió con el simulador de `ml/tests/sim`; las tablas completas están en `algorithm-measurements.md`. Los límites de abajo están fijados por pruebas en `ml/tests/test_algorithm_limits.py`: si cambian, la prueba avisa y hay que actualizar este documento.

**Importante:** son límites contra un simulador. El video real tiene reflejos, sombras, pelotas parecidas y jugadores que tapan, nada de eso está acá. Estos números dicen qué se puede esperar en el mejor caso y dónde está el piso, no reemplazan medir en la cancha de la fase 0.

## Cosas que se arreglaron al medir

Para que quede registro de dónde se rompía y cómo se resolvió.

| Problema | Cómo se vio | Arreglo |
| --- | --- | --- |
| Una falsa detección abría una pista nueva después de un hueco largo; la covarianza grande dejaba pasar cualquier cosa y la pelota "viajaba" 400 píxeles en 3 cuadros | Alturas con 2 a 10 m de error en 3D en 3 de 10 partidos | Una pista nueva exige dos detecciones que coincidan a no más de 2 cuadros, y ninguna detección puede implicar más velocidad que `max_speed_px_s` |
| Con una sola cámara viendo la pelota, la posición en el piso de una pelota alta cae lejísimo (hasta -1980 m) y creaba golpes y botes falsos | Precisión de botes 0,35 | La pelota que una cámara no ve unos cuadros se ubica sobre su rayo, cerca de la parábola entre las dos posiciones 3D vecinas; si no se puede, se descarta si cae fuera de la cancha. Con dos cámaras, un giro que solo tiene posición en el piso no cuenta como bote |
| Los candidatos vecinos a un golpe o bote se parecen a uno (ventanas contaminadas) y a veces ganaba el equivocado: golpes cerca de la red clasificados como "red", o golpes que se perdían | Golpes 0 de 1 en una prueba sintética limpia | Se queda el candidato cuyo ajuste de las dos rectas deja menos error, se afina el instante en pasos de 1 ms y el golpe se descarta solo si un contacto ya centrado está a menos de 100 ms |
| La pose de la cámara de atrás salía espejada (cámara a 54 m de altura) con `SOLVEPNP_IPPE` | Prueba de pose de la cámara B | `SOLVEPNP_SQPNP` más refinamiento LM y se rechaza una pose por debajo del piso |
| Ventanas de 120 ms con 15 ms de guarda: a 25 cuadros por segundo caben 3 puntos y los botes redondeados por el suavizado contaminaban el ajuste | Golpes F1 0,83 y botes F1 0,68 a 25 fps | Ventana 250 ms, guarda 40 ms: golpes 0,945 y botes 0,88 a 25 fps |
| Umbral de bote (2,5 m/s) por debajo de la verdad que se quería encontrar (4,4 m/s de cambio de velocidad normal): rodadas lentas contadas como botes | Precisión de botes 0,81 | `min_normal_speed_change_mps: 4.4` |
| Error de superficie entre vidrio de fondo y de costado en un rincón | No apareció con la posición sola hasta ruido alto; con ruido "alto" la posición sola acierta 94,8% y la dirección del cambio de velocidad 98,0% | La superficie sale del plano cuya normal mejor alinea con el cambio de velocidad (`min_normal_alignment`), no del plano más cercano |

## Límites que no se pudieron sacar

### Calibración

- **Más de 1 píxel de error al marcar los 12 puntos hace que el instalador tenga que repetir.** Con 1,0 px se rechaza el 17,5%; con 1,5 px el 77,5%; con 2 px el 97,5% y con 3 px el 100%. El error medio sobre los 12 puntos es aproximadamente 4 cm por cada píxel (el fondo lejano está a 26 m de la cámara y un píxel son unos 3 cm). Hay que dar al instalador una vista ampliada para marcar con la mitad de un píxel.
- **El error del lente pesa.** Un error de 0,5% en la distancia focal y de 0,01 en el primer coeficiente de distorsión (medidos con el tablero) suma unos 1,5 cm al error en el piso aun con clics perfectos. Si el tablero se mide mal, ninguna calibración de 12 puntos lo arregla.
- **El chequeo diario no ve movimientos chicos.** Una cámara corrida 2 píxeles (7 cm de línea) no avisa; 4 píxeles (13 cm) siempre avisa. El umbral es `drift_max_mean_shift_cm: 10`. Una cámara que se movió así sigue con la calibración vieja y todas las posiciones quedan corridas esos centímetros sin aviso.
- El chequeo diario necesita los 12 puntos de nuevo. Encontrarlos solo con las líneas de la cancha (sin que el instalador los vuelva a marcar) no se hizo: es el modelo de puntos clave de la etapa 1, fuera de este alcance.

### Pelota en 2D de cada cámara

- **Huecos de más de 10 cuadros no se rellenan** (a propósito: el filtro de Kalman de aceleración constante no sabe qué pasó en el medio). Con huecos largos de verdad (detector ciego 40% del tiempo, ráfagas de 7 cuadros) la recuperación de huecos cortos baja a 74,5% y las pistas se cortan.
- **El suavizado redondea las esquinas.** Se compensa en las etapas siguientes (ajuste de dos rectas e intersección). Es la causa más probable de los botes que se pierden a 25 cuadros por segundo con huecos cerca del bote (no se aisló con una medición propia).
- Una detección falsa que cae cerca de la pista no se rechaza: con ruido bajo se rechaza el 93% de las falsas.

### Triangulación

- **La profundidad es débil cuando la pelota está a la altura de las cámaras (6 m).** Los dos rayos son casi la misma recta y un píxel de error corre la pelota metros. Se rechaza el punto si el ángulo entre rayos es menor de 6 grados (`min_ray_angle_deg`), pero quedan casos aislados con 1 a 2,4 m de error (la prueba exige menos del 0,5% de los cuadros con más de 1 m de error en la altura). Subir el ángulo mínimo a 14 grados no cambió el error máximo y bajó los golpes con ruido medio de F1 0,955 a 0,941, así que se dejó en 6.
- **Con una sola cámara viendo la pelota, la posición 3D es una apuesta.** Se ubica sobre el rayo cerca de la parábola entre dos puntos 3D buenos, vale para huecos de hasta 0,4 s a cada lado y cuando el rayo no va por la misma línea que el movimiento. Si el rebote cae dentro del hueco, no acierta y se devuelve la posición del piso sin altura.
- **La velocidad de la pelota con 3 cuadros después del golpe es muy ruidosa**: error mediano de 13% a 15% . Con 6 cuadros baja a 2% a 5% (ruido bajo a alto), con 12 a 3% a 6%. La especificación pide 3 cuadros; hay que decidir si se sube a 6.
- **Ruido extremo** (detección de 3 píxeles, 40% de huecos, 2% de falsas): 89,7% de los cuadros en 3D, error mediano 8,6 cm pero p95 de 36 cm.

### Golpes

- **Un golpe sin pelota antes** (el saque, cuando la pelota sale del reposo o de la mano) no tiene trayectoria anterior y no se detecta con esta etapa. Lo resuelve el algoritmo del punto con el bote del saque.
- **Con una sola cámara se pierden casi todos** (F1 0,21 con ruido medio): la posición en el piso de una pelota en el aire no coincide con la de la muñeca. La decisión de 2 cámaras es entonces necesaria, no un lujo.
- **Sin altura de muñeca** (solo posición en el piso) baja un par de puntos (F1 0,931 contra 0,950).
- **Ruido alto**: F1 0,893. **Ruido extremo**: 0,792, no alcanza el 0,90 pedido en el issue. El punto de quiebre del 0,90 está entre ruido medio y alto: ~1 píxel de detección con 12 a 25% de huecos.
- Dos golpes a menos de 250 ms son uno solo (`min_separation_ms`); en un intercambio de voleas en la red pasa.

### Botes

- **Dos contactos a menos de 120 ms son un solo bote**: el rincón de vidrio de fondo más costado, o vidrio de fondo más piso (alrededor del 7% de los contactos del simulador). El tipo que se informa es el de uno de los dos.
- **A 25 cuadros por segundo la recuperación baja a 0,79** con ruido medio (0,90 con ruido bajo): con cuadros cada 40 ms los dos lados de la ventana tienen pocos puntos si falta uno. La precisión sigue en 1,00. Si la prioridad es contar botes, analizar a más de 25 cuadros por segundo en la ventana de cada golpe mejora esto.
- **Ruido extremo**: recuperación 0,60.
- **Con una sola cámara** (F1 0,30) no se pueden separar botes de golpes sin la altura, y la superficie acierta 74%.
- No se midió por separado el borde entre vidrio y reja (a 3 m de altura): ahí la superficie depende del error de altura y se confunde cuando ese error pasa de unos 30 cm.
- La reja de entrada o una puerta abierta no está en el plano por defecto: se carga un `SurfacePlan` por cancha al instalar.
