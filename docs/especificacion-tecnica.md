# Especificación técnica del sistema

Oct 16, 2026 · @Uri

Este documento dice cómo funciona por dentro cada parte del sistema y es la base del prompt para los agentes que lo van a programar. Lo de negocio, precios y decisiones está en el documento de estructura; si algo choca, mandan las Decisiones tomadas de ese documento.

## 1. Estilo de código y convenciones

Todo el código vive en un solo repositorio, con TypeScript estricto para producto y Python tipado para IA y el equipo del club. Las reglas existen para que 8 agentes escriban código que parezca escrito por una sola persona, y para que cualquier error se encuentre rápido.

**Estructura del repositorio:**

```
/apps/mobile          App React Native + Expo (jugador y entrenador)
/apps/web             Next.js: web del partido, panel del club, consola interna
/services/api         NestJS: API, reservas, pagos, colas
/services/edge-agent  Python: agente que corre en el club
/ml                   Python: pipeline de visión, entrenamiento, evaluación
/packages/contracts   OpenAPI, esquemas de eventos y tipos compartidos (generados)
/packages/ui          Componentes visuales compartidos entre web y app
/packages/config      ESLint, Prettier, tsconfig, ruff compartidos
/infra                Terraform, Docker, scripts de despliegue
/docs                 Decisiones de arquitectura (ADR) y guías
/.claude/agents       Archivo de rol de cada agente
```

**Reglas comunes:**

| Tema | Regla | Por qué |
| --- | --- | --- |
| Idioma | Código, nombres y commits en inglés; textos para el usuario en español rioplatense, en archivos de traducción (`es-AR`) | El inglés es lo que mejor entienden las librerías y los agentes; los textos separados permiten corregirlos sin tocar código |
| Fechas | Se guardan en UTC; se muestran en `America/Argentina/Buenos_Aires` | Evita errores de turnos corridos una hora |
| Plata | Enteros en centavos de ARS (`amount_cents`), nunca decimales | Los decimales redondean mal |
| IDs | UUID v7 en todas las tablas | Ordenables por fecha y no adivinables |
| Contratos | Se escribe el contrato OpenAPI primero y se generan los tipos para web, app y backend | Un cambio de API rompe la compilación en vez de romper en producción |
| Errores | Cada error tiene un código estable (`BOOKING_SLOT_TAKEN`), un mensaje para el usuario y detalle técnico en el log | La app muestra el mensaje correcto y soporte encuentra el caso |
| Logs | JSON estructurado con `request_id`, `club_id`, `match_id`; nunca datos personales ni tokens | Se puede seguir un partido de punta a punta sin exponer a nadie |
| Configuración | Variables de entorno validadas al arrancar; secretos solo en el gestor de secretos | Un servicio mal configurado no arranca en vez de fallar a medias |
| Commits | Conventional Commits (`feat(bookings): ...`), una rama por tarea, PR chico | Historial legible y revisiones rápidas |
| Pruebas | Toda función con lógica de negocio lleva prueba; todo bug arreglado lleva la prueba que lo reproduce | Los agentes cambian mucho código y las pruebas evitan que rompan lo anterior |

**TypeScript (backend, web, app):** `strict: true`, ESLint + Prettier, validación de entradas con Zod en cada borde (API, webhooks, formularios). En NestJS cada módulo tiene `controller` (HTTP), `service` (lógica), `repository` (base de datos con Prisma) y `dto`; la lógica nunca va en el controller. En React, componentes funcionales, estado de servidor con TanStack Query, sin estado global salvo sesión.

**Python (club e IA):** Python 3.12, `ruff` + `mypy --strict`, modelos de datos con Pydantic, funciones puras para cada etapa del pipeline (entra un objeto tipado, sale otro). Ningún número mágico: todos los umbrales viven en un archivo de configuración versionado (`ml/config/thresholds.yaml`), para poder ajustarlos sin tocar código.

## 2. Modelo de datos

La base es PostgreSQL con 22 tablas agrupadas en 6 áreas. Todas llevan `id` (UUID v7), `created_at` y `updated_at`; las que tienen dueño llevan `club_id` para que cada club vea solo lo suyo.

| Área | Tabla | Campos clave | Relaciones |
| --- | --- | --- | --- |
| Personas | `users` | nombre, teléfono (WhatsApp), email, foto, categoría declarada (8va a 1ra), mano hábil, lado de juego, fecha de nacimiento, consentimientos | Tiene un `rating` y muchas `auth_identities` |
| Personas | `auth_identities` | proveedor (whatsapp, google, apple, email), id externo | Pertenece a un `user` |
| Personas | `memberships` | rol (`owner`, `staff`, `coach`, `player`), estado | Une `user` con `club` |
| Clubes | `clubs` | nombre, dirección, CUIT, zona horaria, logo, sponsor, plan (`loan` o `purchase`), configuración de cobros | Tiene `courts`, `devices`, `contracts` |
| Clubes | `courts` | nombre, techada (sí/no), estado, calibración vigente | Pertenece a `club`; tiene 2 `cameras` |
| Clubes | `contracts` | plan, abono por cancha en centavos, fecha de inicio, meses mínimos, porcentaje de comisión | Pertenece a `club` |
| Equipo | `devices` | número de serie, versión de software, última señal, disco libre, temperatura de GPU | Pertenece a `club` |
| Equipo | `cameras` | dirección RTSP (cifrada), extremo de la cancha (A o B), resolución, estado | Pertenece a `court` y a `device` |
| Equipo | `calibrations` | 12 puntos en píxeles, matriz de homografía 3x3, error en cm, fecha | Pertenece a `camera`; la vigente la marca `courts` |
| Reservas | `booking_slots_rules` | días, horario, duraciones permitidas (60, 90, 120), precio por franja, seña | Pertenece a `court` |
| Reservas | `bookings` | inicio, fin, estado, precio, seña pagada, origen (app o panel) | Pertenece a `court`; tiene 1 a 4 `booking_players` |
| Reservas | `booking_players` | posición (1 a 4), invitado por, aceptado | Une `booking` con `user` |
| Partidos | `matches` | tipo (`match` o `lesson`), estado, inicio, fin, punto de oro (sí/no), sets, marcador final, versión del modelo | Viene de una `booking`; tiene `match_players`, `points`, `clips` |
| Partidos | `match_players` | equipo (1 o 2), lado inicial, track asignado, confirmado por el jugador | Une `match` con `user` |
| Partidos | `points` | número, set, game, quién sacó, ganador, motivo de fin, confianza, corregido por usuario | Pertenece a `match`; tiene `shots` |
| Partidos | `shots` | tiempo en ms, jugador, tipo de golpe, posición del jugador en metros, destino en metros, velocidad estimada | Pertenece a `point` |
| Partidos | `match_stats` | JSON con todas las estadísticas por jugador y por pareja, versión de fórmula | Uno por `match` y `user` |
| Partidos | `insights` | texto, tipo, datos que lo respaldan, orden | Pertenece a `match` y `user` |
| Media | `media_assets` | tipo (`full`, `clip`, `reel`, `thumbnail`), ruta en almacenamiento, duración, vence el | Pertenece a `match` |
| Media | `clips` | inicio y fin en ms, origen (`button`, `app`, `auto`), puntaje de highlight | Pertenece a `match`; tiene un `media_asset` |
| Plata | `payments` | concepto (`player_extra`, `lesson`, `deposit`, `subscription`), monto, comisión, estado, id de Mercado Pago | Pertenece a `user` y `club` |
| Plata | `settlements` | período, total cobrado, comisiones, total a pagar, estado, factura | Pertenece a `club` |

También hay tablas técnicas: `ratings` (nivel de cada jugador), `lessons` (clase con entrenador y alumnos), `notifications`, `audit_log` (quién cambió qué) y `processing_jobs` (cada análisis con su estado y duración).

**Reglas que garantiza la base, no el código:** dos reservas no pueden pisarse en la misma cancha (restricción de exclusión sobre el rango horario), un pago de Mercado Pago no puede registrarse dos veces (índice único sobre su id) y un jugador no puede estar dos veces en el mismo partido.

## 3. Ciclo de vida de cada entidad

Cada entidad que cambia con el tiempo tiene una lista cerrada de estados y solo puede pasar de uno a otro por los caminos de estas tablas. El backend rechaza cualquier otro cambio, así un error nunca deja un partido o un pago en un estado imposible.

**Partido (`matches.status`):**

| Estado | Pasa a | Qué lo dispara |
| --- | --- | --- |
| `scheduled` | `recording`, `cancelled` | Llega la hora de la reserva (el equipo del club arranca 2 minutos antes) o se cancela la reserva |
| `recording` | `recorded` | Termina el turno, o el club corta la grabación desde el panel |
| `recorded` | `processing` | El equipo del club toma el partido de su cola local |
| `processing` | `published`, `failed` | Termina el análisis; si falla 2 veces en el club, se manda a la nube |
| `published` | `needs_review`, `archived` | Un jugador corrige el marcador, o pasan 30 días y se borra el video completo |
| `needs_review` | `published` | Se recalculan estadísticas con la corrección |
| `failed` | `processing` | Reproceso manual desde la consola interna |

**Reserva (`bookings.status`):** `held` (bloqueada 10 minutos mientras se paga la seña) → `confirmed` → `completed` o `cancelled` o `no_show`. Si la seña no se paga en 10 minutos, pasa a `expired` y el turno se libera.

**Trabajo de análisis (`processing_jobs.status`):** `queued` → `running` → `succeeded` o `failed`. Cada trabajo guarda en qué etapa del pipeline va, para retomar desde ahí si se corta la luz.

**Pago (`payments.status`):** `pending` → `approved` o `rejected`; `approved` → `refunded`. El estado lo cambia solo el webhook de Mercado Pago, nunca la app.

**Liquidación (`settlements.status`):** `draft` (se arma el día 1 de cada mes) → `approved` (lo revisan ustedes) → `invoiced` → `paid`.

## 4. Agente del club

El agente del club son 7 procesos en contenedores Docker que se coordinan con una base SQLite local. Está diseñado para internet flojo: puede trabajar 48 horas sin conexión sin perder un partido.

| Proceso | Qué hace | Cómo funciona |
| --- | --- | --- |
| `recorder` | Graba cada cámara | FFmpeg lee el RTSP de cada cámara y guarda segmentos de 10 segundos sin recomprimir, en 2560x1440 a 25 cuadros por segundo (unos 3,6 GB por hora y por cámara). Graba solo durante turnos, con 2 minutos de margen antes y después |
| `scheduler` | Sabe qué grabar | Cada minuto baja las reservas de las próximas 48 horas y las guarda localmente. Si no hay internet, sigue con lo guardado. El club también puede iniciar una grabación a mano desde el panel |
| `clipper` | Corta los clips | Recibe el botón físico por la red local (MQTT) o el toque en la app por un canal en tiempo real. Junta los segmentos de los últimos 30 segundos más 5 segundos posteriores, y arma el clip en menos de 10 segundos |
| `processor` | Corre la IA | Toma partidos de la cola local y ejecuta el pipeline de la sección 5 con la GPU. Los clips se procesan antes que las estadísticas |
| `uploader` | Sube a la nube | Cola con prioridades: 1) marcador y estadísticas, 2) clips, 3) miniaturas, 4) video completo. Subidas por partes que se retoman si se corta, con un límite de velocidad para no saturar el WiFi del club |
| `health` | Avisa si algo falla | Cada 60 segundos manda disco libre, temperatura, estado de cada cámara y largo de la cola. Si una cámara se cae durante un turno por más de 5 minutos, avisa al club y a soporte |
| `updater` | Se actualiza solo | Baja imágenes firmadas entre las 4 y las 6 de la mañana. Si el `health` falla después de actualizar, vuelve a la versión anterior |

**Dimensionamiento:** el pipeline tiene que analizar cada cámara al menos 6 veces más rápido que el tiempo real en una GPU clase RTX 4060 (modelos en TensorRT con precisión FP16, análisis a 25 cuadros por segundo y pose solo alrededor de cada golpe). Con eso un equipo alcanza para 4 canchas con 10 turnos por día cada una; un club de más de 4 canchas lleva un segundo equipo. Si la cola local supera 6 horas de atraso, los partidos más viejos se mandan a la GPU de la nube. Este número se mide en la fase 0 y, si no se alcanza, se ajustan modelos o equipo antes de instalar en más clubes.

**Video que sube a la nube:** se sube una versión de 720p a 1,5 Mbps (aproximadamente 1 GB por partido de 90 minutos), recomprimida con la GPU. Un club de 4 canchas necesita unos 11 Mbps de subida durante 8 horas de noche. Si el club no llega, el video completo queda en el club y sube solo cuando un jugador lo pide; mientras tanto el jugador ya tiene clips y estadísticas.

**Disco:** los 2 TB guardan unos 4 días de grabación original de un club de 4 canchas. El original se borra del club cuando la nube confirma la subida y el análisis terminó; si el disco pasa el 85%, se borra lo más viejo que ya esté subido.

## 5. Algoritmos de visión

El pipeline convierte dos videos en una lista de golpes y botes con posición en metros y momento exacto. Cada etapa es una función de Python que recibe el resultado de la anterior y guarda el suyo en un archivo Parquet, así se puede retomar o reprocesar desde cualquier etapa. Todos los umbrales de abajo son valores iniciales y viven en `ml/config/thresholds.yaml`.

**Geometría de la cancha:** 10 x 20 m, red en y = 10 m con 0,88 m de alto en el centro y 0,92 m en los extremos, líneas de servicio a 6,95 m de la red, línea central. El sistema usa metros con origen en la esquina del lado A. Las dos cámaras (A y B) están elevadas detrás de cada vidrio de fondo y ven toda la cancha; para cada objeto se usa la cámara de la mitad donde está, que lo ve más grande, y la otra como respaldo. Las cámaras se sincronizan por NTP con el equipo del club, y el desfase fino se corrige alineando las trayectorias de la pelota de ambas cámaras.

1. **Calibración.** El instalador marca 12 puntos conocidos de la cancha en la consola, con sugerencia automática de un modelo de puntos clave. Se calcula la homografía con `cv2.findHomography` y RANSAC; si el error promedio supera 5 cm, se rehace. Para la vista 3D se usa además `cv2.solvePnP` con los parámetros ópticos del modelo de cámara (medidos una vez con un tablero de ajedrez). Todos los días a las 7 se compara la posición de las líneas con la calibración guardada; si la cámara se movió, se avisa a soporte. También se define una máscara de la cancha con 1,5 m de margen para ignorar al público.
2. **Detección de jugadores.** Un detector con licencia Apache 2.0 (YOLOX-m o RT-DETR), ajustado con nuestros partidos, encuentra personas con confianza mínima de 0,5. El punto de apoyo de cada jugador es el centro inferior de su recuadro, convertido a metros con la homografía. Se descartan detecciones fuera de la máscara.
3. **Seguimiento.** ByteTrack une las detecciones cuadro a cuadro (umbral 0,5, memoria de 2 segundos). Como en la cancha siempre hay 4 jugadores, los fragmentos se reúnen en exactamente 4 pistas con el algoritmo húngaro, combinando cercanía de posición y un vector de apariencia de la ropa (modelo OSNet). La pareja se define por de qué lado de la red está cada pista en el primer saque, y se mantiene aunque cambien de lado.
4. **Identidad del jugador.** No se usa reconocimiento facial. Al terminar, la app le muestra a cada jugador las 4 miniaturas y toca "este soy yo"; cada confirmación reduce las opciones de los demás. Las estadísticas de un lugar sin confirmar quedan guardadas hasta que alguien lo reclame. Si el jugador escaneó el QR, se le sugiere la miniatura de quien estaba más cerca de la cámara en ese momento.
5. **Pelota.** Un modelo tipo TrackNetV3 recibe 3 cuadros seguidos a 512x288 y devuelve un mapa de calor; la pelota es el pico si supera 0,5. Un filtro de Kalman de aceleración constante suaviza la trayectoria, completa huecos de hasta 10 cuadros y descarta saltos imposibles. Cuando las dos cámaras la ven con confianza, se triangula su posición en 3D (altura incluida); si no, se trabaja en 2D.
6. **Pose.** Solo en una ventana de 0,5 segundos alrededor de cada golpe candidato, RTMPose (licencia Apache 2.0) calcula 17 puntos del cuerpo del jugador. Hacerlo solo ahí ahorra más del 90% del cálculo.
7. **Golpes.** Hay golpe cuando la pelota cambia de dirección más de 35 grados o cambia bruscamente de velocidad, a menos de 1,2 m de la muñeca de un jugador. El golpe se atribuye al jugador más cercano.
8. **Botes.** Hay bote cuando la pelota pasa de bajar a subir sin un jugador al alcance. La superficie sale de dónde ocurre: dentro del piso es `floor`; sobre y = 0 o y = 20 es `back_glass`; sobre x = 0 o x = 10 es `side_glass` o `fence` según el plano de vidrios y rejas que se carga por cancha al instalar. Si la pelota frena y vuelve sobre y = 10 por debajo de la altura de la red, es `net`.
9. **Tipo de golpe.** Un clasificador chico (red temporal sobre los 17 puntos del cuerpo en ±15 cuadros, más datos de la pelota: altura de contacto respecto de la cabeza, si picó antes, si salió de pared, lado del cuerpo y zona de la cancha) elige entre: saque, derecha, revés, volea de derecha, volea de revés, bandeja, víbora, smash, globo y salida de pared. Si la confianza es menor a 0,6, el golpe queda como `unknown` y no cuenta para estadísticas por tipo.

## 6. Algoritmo del punto y del marcador

El marcador sale de una máquina de estados que lee la lista de golpes y botes en orden y aplica el reglamento de pádel. Es la parte que más define si el producto sirve, por eso tiene tres capas de corrección.

&#91;embedded content: máquina de estados del punto\]

Un saque válido abre el rally; una primera falta vuelve a esperar el segundo saque y una segunda falta da el punto al que resta.

**Reglas que cierran un punto (en el orden en que se evalúan):**

| # | Evento detectado | Pierde el punto |
| --- | --- | --- |
| 1 | Saque: el primer pique cae fuera del cuadro de servicio cruzado, toca la red, o después del pique pega en la reja | Falta; con la segunda falta pierde el que saca |
| 2 | La pelota golpeada pega en el propio piso antes de cruzar la red | El que golpeó |
| 3 | La pelota golpeada pega en la red y no la cruza | El que golpeó |
| 4 | La pelota cruza la red y su primer contacto es vidrio, reja o pared del rival, sin picar antes en el piso | El que golpeó |
| 5 | Después de picar en el piso del rival, pica una segunda vez en el piso sin que nadie la golpee | La pareja de ese lado |
| 6 | Después de picar en el piso del rival, sale de la cancha por encima de los vidrios o por la puerta | La pareja de ese lado |
| 7 | No se ve la pelota durante 4 segundos en pleno rally | Se decide por el último evento válido y el punto queda con confianza baja |

El golpe a la pared propia antes de cruzar la red es válido (contrapared), siempre que después la pelota cruce y pique en el piso rival.

**Marcador:** games de 15, 30, 40; en 40 iguales, punto de oro o ventaja según la configuración del partido. Set a 6 games con diferencia de 2; en 6-6, tie-break a 7. El tercer set puede ser un super tie-break a 10 si el club lo configura. El saque rota por game entre parejas y, dentro de cada pareja, entre sus dos jugadores. Los cambios de lado son en los games impares.

**Las tres capas de corrección:**

1. **Coherencia del saque.** Se sabe quién tiene que sacar en cada punto. Si el que saca no es el esperado, faltó detectar un punto o un game, y el algoritmo busca el punto dudoso más probable y lo corrige.
2. **Confianza por punto.** Cada punto multiplica la confianza de los eventos que lo deciden. Los puntos por debajo de 0,7 se marcan para revisión y la app se los muestra a los jugadores con el clip, para que confirmen quién lo ganó.
3. **Marcador final.** Si un jugador carga el resultado (por ejemplo 6-4 6-3), un alineamiento por programación dinámica (tipo Viterbi) elige la secuencia de ganadores más probable que termine en ese resultado y corrige los puntos dudosos. Cada corrección queda guardada y sirve para reentrenar los modelos.

## 7. Estadísticas, highlights, insights, reels, modo clase y nivel

Todo se calcula a partir de puntos, golpes y botes ya validados, con fórmulas fijas y versionadas (`match_stats.formula_version`). La IA de lenguaje solo redacta: nunca inventa ni calcula un número.

**Zonas de la cancha:** cada mitad se divide en 9 zonas: 3 a lo ancho (izquierda, centro, derecha, de 3,33 m) por 3 de profundidad (red: 0 a 3 m de la red; medio: 3 a 6,95 m; fondo: 6,95 a 10 m).

| Estadística | Cómo se calcula |
| --- | --- |
| Dónde se fue el partido | Por cada punto perdido, la zona del evento decisivo: el golpe que falló la pareja (si fue error) o el pique del golpe ganador rival en su lado (si fue winner). Se muestra cantidad y porcentaje por zona |
| Cobertura | En cada golpe rival, se mide la distancia de cada zona propia al jugador más cercano. La zona queda descubierta si esa distancia supera 3 m. El mapa muestra el porcentaje de golpes rivales con cada zona descubierta |
| La red que nadie cubrió | Puntos perdidos con el evento decisivo en una zona de red mientras los dos jugadores estaban a más de 4 m de la red. Se destaca si son 3 o más y al menos el 25% de los perdidos |
| El mismo lado | Reparto de los piques de los golpes rivales por tercio de cancha y por jugador receptor (el más cercano al pique). Se destaca si un jugador recibe el 60% o más, o un tercio el 50% o más |
| Winner | Golpe tras el cual el rival no vuelve a tocar la pelota y el punto termina por las reglas 5 o 6 |
| Error | Golpe que pierde el punto por las reglas 2, 3 o 4 |
| Error forzado o no forzado | Forzado si el golpe rival anterior fue smash o víbora, o si el jugador tuvo que moverse más de 3 m en menos de 1,2 segundos; si no, no forzado |
| Tiempo en la red | Porcentaje del tiempo de rally a menos de 4 m de la red |
| Subidas a la red | Pasos de más de 6 m a menos de 4 m de la red |
| Distancia recorrida | Suma de desplazamientos durante los rallies, con la posición suavizada (filtro Savitzky-Golay de 0,5 segundos) |
| Mapa de calor | Histograma de posiciones en celdas de 0,5 m, suavizado |
| Rallies | Golpes por punto: promedio y máximo |
| Saque | Porcentaje de puntos ganados con saque propio y de primeros saques adentro |
| Por tipo de golpe | Cantidad, porcentaje de winners y de errores de cada tipo |
| Velocidad de la pelota | Máxima en los 3 cuadros posteriores al golpe; solo con posición 3D, y se muestra como estimada |

**Highlights automáticos:** cada punto recibe un puntaje = 0,4 x largo del rally (normalizado en el partido) + 0,3 x winner de smash o víbora + 0,2 x velocidad (normalizada) + 0,1 x punto clave (punto de oro, set o partido). Los 5 mejores se cortan desde el saque hasta 2 segundos después del final.

**Insights en frases:**

1. Un motor de unas 20 reglas calcula hechos con este formato: `{tipo, métrica, valor, comparación, puntos_involucrados}`. Ejemplo: "perdiste 7 de 10 puntos cuando tu compañero quedó solo en la red".
2. Se eligen los 3 hechos con más puntos involucrados.
3. La API de Claude (modelo `claude-haiku-5-5`, el más barato) recibe los hechos en JSON y los redacta en frases de 15 palabras como máximo, en español rioplatense y con el tono del video de referencia.
4. Un validador comprueba que cada número de la frase esté en el hecho; si no, se usa una plantilla fija. Cada hecho se asocia a un consejo para el próximo partido, tomado de un catálogo armado con entrenadores.

**Reel vertical:** 1080x1920 de 20 a 30 segundos. Logo del club 1,5 segundos, los 3 mejores highlights con un recorte que sigue a la pelota y a los jugadores (ventana suavizada que contiene a todos), marcador y una frase de insight en letra grande, y cierre con logo. Se arma con plantillas de FFmpeg y se codifica con la GPU del club.

**Modo clase:** para cada golpe se miden altura de contacto respecto del hombro, distancia del cuerpo a la pelota, flexión de rodillas en el contacto, giro de hombros en la preparación, tiempo de preparación y vuelta a la posición. Cada medida se compara con un rango de referencia por tipo de golpe, definido con los entrenadores del piloto. Si un golpe sale del rango en el 40% o más de sus repeticiones, es una mejora; se muestran las 3 principales con clips de ejemplo.

**Nivel del jugador:** Glicko-2 sobre los resultados de los partidos, con la pareja como promedio de sus dos jugadores y un peso por diferencia de games. El punto de partida es el medio de la categoría declarada, con incertidumbre alta. El número se traduce a categoría (8va a 1ra) con cortes calibrados contra las categorías declaradas de los jugadores, y se muestra recién después de 5 partidos.

## 8. Datos y entrenamiento de modelos

Los modelos se entrenan primero con videos de pádel existentes cuya licencia permita uso comercial y entrenamiento (ADR 0002). Después se ajustan con partidos propios, porque la luz, los vidrios y los ángulos de nuestras canchas no están en esos videos. La fase 0 junta 20 a 30 partidos propios, que se usan solo para ajustar y medir, y cada corrección de un jugador en la app agrega datos nuevos.

**Qué se etiqueta y cuánto:**

| Dato | Herramienta | Cantidad propia para la primera versión |
| --- | --- | --- |
| Recuadros de jugadores | CVAT, con pre-etiquetado del detector genérico | 5.000 cuadros de 20 a 30 partidos, de día y de noche |
| Posición de la pelota | CVAT, un punto por cuadro | 30.000 cuadros de 20 partidos |
| Golpes y botes con superficie | Herramienta propia en la consola sobre la línea de tiempo | 20 partidos completos |
| Tipo de golpe | Herramienta propia, sobre clips de 1 segundo | 3.000 golpes, al menos 150 por tipo |
| Ganador de cada punto | Herramienta propia | 20 a 30 partidos (los de la fase 0) |

El resto de los datos de entrenamiento sale de videos existentes, con las etiquetas que traigan o etiquetados con las mismas herramientas. Golpes y botes con superficie se etiquetan sobre partidos propios, porque dependen de nuestras 2 cámaras.

**Métricas mínimas para pasar al piloto pago:**

| Etapa | Métrica | Mínimo |
| --- | --- | --- |
| Jugadores | mAP@0.5 | 0,95 |
| Seguimiento | Cambios de identidad por partido | Menos de 2 |
| Pelota | Detección a menos de 5 píxeles (F1) | 0,85 |
| Golpes | F1 con 100 ms de tolerancia | 0,90 |
| Botes y superficie | Precisión | 0,85 |
| Tipo de golpe | Precisión promedio | 0,80 |
| Puntos | Ganador correcto sin correcciones | 9 de cada 10 puntos |

**Reglas de entrenamiento:** 15 partidos propios, grabados con nuestras 2 cámaras, quedan siempre fuera del entrenamiento y sirven solo para medir. Cada modelo se guarda con su versión, sus datos y sus métricas (MLflow), y solo se instala en los clubes si mejora o iguala todas las métricas sobre esos 15 partidos. Los puntos corregidos por jugadores entran a una cola de revisión y, una vez validados, al siguiente entrenamiento. El entrenamiento corre en GPU por hora en la nube.

## 9. Reservas

Las reservas reemplazan al WhatsApp del club y son las que le dicen al equipo del club cuándo grabar y a quién pertenece cada partido. La garantía de que nunca hay dos reservas pisadas la da la base de datos, no el código.

1. **Reglas del club.** Por cancha: días y horario de apertura, duraciones permitidas (60, 90 o 120 minutos), cada cuántos minutos puede empezar un turno (30 por defecto), precio por franja horaria (por ejemplo, hora pico de 18 a 23) y seña (porcentaje o monto fijo, o ninguna).
2. **Disponibilidad.** Para un día y una duración, se generan todos los inicios posibles según las reglas y se descartan los que se superponen con reservas `held` o `confirmed`. Se responde en menos de 300 ms con caché de 30 segundos por cancha.
3. **Bloqueo.** Al elegir un turno se crea la reserva en estado `held` con vencimiento en 10 minutos, dentro de una transacción. Si dos personas eligen el mismo turno a la vez, la restricción de exclusión de PostgreSQL deja pasar a una sola y la otra recibe `BOOKING_SLOT_TAKEN`.
4. **Seña.** Si el club pide seña, se abre el pago de Mercado Pago; el webhook aprobado pasa la reserva a `confirmed`. Sin seña, se confirma en el momento. Un proceso cada minuto vence los bloqueos sin pagar.
5. **Jugadores.** El que reserva ocupa el lugar 1 e invita a los otros 3 con un link por WhatsApp. Cada invitado acepta con su cuenta, y eso lo vincula al partido grabado.
6. **Turnos fijos.** Un turno semanal fijo (muy común en los clubes) se guarda como regla de repetición y genera las reservas de las próximas 8 semanas, renovadas cada semana.
7. **Carga desde la recepción.** Para los turnos que siguen llegando por WhatsApp, el panel tiene un formulario rápido: teléfono y turno. Si el teléfono no tiene cuenta, se crea una pendiente y le llega un WhatsApp para activarla.
8. **Cancelación.** Cada club define con cuántas horas de anticipación se devuelve la seña (24 por defecto). La devolución se pide a Mercado Pago por su API. Si nadie se presenta, el club marca `no_show` y la seña no se devuelve.
9. **Avisos.** WhatsApp al confirmar, 3 horas antes del turno y al publicarse el partido.

## 10. Pagos, liquidación y facturación

La plata de jugadores va directo a la cuenta de Mercado Pago del club o del entrenador, y Mercado Pago nos separa la comisión en el mismo pago. Así no tenemos plata de terceros en nuestra cuenta y la liquidación mensual queda simple.

| Cobro | Quién paga | Cómo funciona |
| --- | --- | --- |
| Abono mensual | Club | Suscripción de Mercado Pago a nombre de nuestra empresa, por cantidad de canchas. Se ajusta cada 3 meses por el índice del contrato. Si falla el cobro, se avisa al club y a los 15 días el panel muestra deuda; el servicio se corta a los 30 días |
| Compra del equipo | Club | Pago único o hasta 6 cuotas de Mercado Pago |
| Extra por partido | Jugador | Pago del modelo marketplace de Mercado Pago: el club conecta su cuenta una vez (OAuth) y cada pago se crea con `marketplace_fee` del 10% para nosotros |
| Clase | Alumno | Igual que el extra, con la cuenta del entrenador |
| Seña de reserva | Jugador | Igual que el extra, a la cuenta del club, sin comisión durante el piloto |

**Reglas técnicas:**

- Los webhooks de Mercado Pago se verifican con su firma (`x-signature`) y se procesan una sola vez por id de pago, aunque lleguen repetidos.
- Todas las noches un proceso compara los pagos de Mercado Pago con los de nuestra base y avisa cualquier diferencia.
- Si un club todavía no conectó su cuenta, cobramos nosotros y le transferimos en la liquidación mensual, descontando la comisión.
- **Liquidación:** el día 1 de cada mes se arma un resumen por club con abono, cobros a jugadores, clases y comisiones. Ustedes lo aprueban en la consola y se emite la factura.
- **Facturación:** factura electrónica de ARCA (ex AFIP) emitida por API a través de un proveedor de facturación. El tipo de factura (A o B) lo define el contador según la condición fiscal de la SAS y del club.

## 11. API y eventos

La API es REST con JSON bajo `/v1`, definida primero en OpenAPI dentro de `packages/contracts`. Lo que tarda o le interesa a varios módulos viaja como evento por una cola (BullMQ sobre Redis), no como llamada directa.

| Módulo | Endpoints principales | Lo usa |
| --- | --- | --- |
| Auth | `POST /auth/otp/whatsapp`, `POST /auth/otp/verify`, `POST /auth/oauth/{google,apple}`, `POST /auth/refresh` | App y web |
| Usuarios | `GET/PATCH /me`, `GET /me/matches`, `GET /me/stats`, `DELETE /me` | App y web |
| Clubes | `GET /clubs`, `GET /clubs/{id}`, `PATCH /clubs/{id}/settings` | Todos; settings solo el club |
| Reservas | `GET /courts/{id}/availability`, `POST /bookings`, `POST /bookings/{id}/invite`, `POST /bookings/{id}/accept`, `POST /bookings/{id}/cancel` | App, web, panel |
| Partidos | `GET /matches/{id}`, `POST /matches/{id}/claim-player`, `POST /matches/{id}/score-correction`, `POST /matches/{id}/clips` | App y web |
| Media | `GET /media/{id}/url` (link firmado que vence en 1 hora), `POST /media/{id}/download` | App y web |
| Entrenadores | `GET/POST /lessons`, `POST /lessons/{id}/notes`, `GET /coach/students` | App |
| Pagos | `POST /payments/checkout`, `POST /webhooks/mercadopago` | App, web, Mercado Pago |
| Panel del club | `GET /club-admin/dashboard`, `GET /club-admin/bookings`, `POST /club-admin/bookings`, `POST /club-admin/recording/{court}/stop`, `GET /club-admin/settlements` | Panel |
| Equipo del club | `GET /device/schedule`, `POST /device/heartbeat`, `POST /device/matches/{id}/results`, `POST /device/uploads` (links firmados de subida) | Agente del club |
| Consola interna | `/admin/...` para clubes, equipos, calibraciones, reprocesos, etiquetado y liquidaciones | Ustedes |

**Eventos:** `booking.confirmed`, `booking.cancelled`, `match.recording_started`, `match.recorded`, `match.processed`, `match.published`, `match.score_corrected`, `clip.created`, `payment.approved`, `payment.refunded`, `device.offline`, `settlement.ready`. Cada evento lleva `event_id` único, fecha y versión de esquema, y quien lo consume tiene que tolerar recibirlo dos veces.

**Tiempo real:** un canal WebSocket por cancha lleva el toque de clip desde la app hasta el equipo del club y el estado de grabación hacia la app. El equipo del club se autentica con un certificado propio (mTLS), distinto de cualquier usuario.

**Paginación y límites:** listas con cursor (`?cursor=&limit=`, máximo 50), 60 pedidos por minuto por usuario, y errores con el formato `{code, message, details}`.

## 12. Seguridad, permisos y privacidad

El sistema guarda imágenes de personas, así que la privacidad es un requisito del producto y no un agregado. Cumplimos la Ley 25.326 de protección de datos personales y registramos la base ante la AAIP.

**Permisos por rol:**

| Rol | Puede ver | Puede hacer |
| --- | --- | --- |
| Jugador | Sus partidos (con sus compañeros de ese partido), sus estadísticas, su perfil | Reservar, reclamar su lugar en un partido, corregir el marcador, descargar, borrar su cuenta |
| Entrenador | Partidos y clases de alumnos que le dieron permiso | Notas, dibujos, planes, cobrar clases |
| Staff del club | Reservas, estado de cámaras, partidos del club (sin estadísticas personales) | Cargar reservas, cortar grabación |
| Dueño del club | Todo lo del staff, más ingresos y liquidaciones | Configurar el club, cobros y planes |
| Soporte (nosotros) | Lo técnico de cualquier club | Reprocesar, calibrar, actualizar equipos; ver un video solo con permiso registrado en `audit_log` |
| Equipo del club | Su propio calendario | Subir resultados y videos de su club |

**Medidas técnicas:**

- Sesiones con token de acceso de 15 minutos y token de renovación de 30 días que se rota en cada uso. Códigos por WhatsApp de 6 dígitos, válidos 5 minutos, con máximo 5 intentos.
- Cada consulta a la base filtra por `club_id` y por permisos (políticas de seguridad a nivel fila de PostgreSQL), así un error en el código no muestra datos de otro club.
- Videos privados en almacenamiento, accesibles solo con links firmados que vencen en 1 hora.
- Cifrado en tránsito (TLS) en todo, y en reposo para la base, los videos y las claves de las cámaras.
- El equipo del club solo acepta conexiones salientes y la VPN de soporte; las cámaras quedan en una red separada sin salida a internet.

**Privacidad:**

- Cartel visible en cada cancha avisando que se graba, con QR a la política de privacidad.
- El jugador acepta términos y privacidad al crear la cuenta o al escanear el QR.
- No se graban turnos de menores sin permiso de padre, madre o tutor cargado en la reserva; las escuelitas se marcan como "no grabar" por defecto.
- No se usa reconocimiento facial.
- Los videos son del jugador. Para entrenar la IA se usan de forma interna; si un jugador pide que no se usen, se excluyen.
- Borrar la cuenta borra perfil, estadísticas y clips propios en 30 días. El video completo de un partido se borra a los 30 días de todas formas.

## 13. Infraestructura, despliegue, monitoreo y costos

Usamos servicios administrados, con servidores en São Paulo donde se puede, para que no haga falta nadie dedicado a mantener servidores y el costo de desarrollo quede por debajo de US$200 por mes.

| Pieza | Servicio | Costo mensual estimado en desarrollo |
| --- | --- | --- |
| Web y panel | Vercel (ya conectado al proyecto) | US$20 |
| API y procesos de cola | Fly.io, región São Paulo | US$30 |
| Base de datos | PostgreSQL administrado en Neon, región São Paulo | US$20 |
| Colas | Redis administrado (Upstash) | US$10 |
| Videos | Cloudflare R2 + Cloudflare Stream | US$15 |
| App móvil | Expo EAS para compilar y publicar | US$0 a US$20 |
| Errores y logs | Sentry + Grafana Cloud | US$0 en plan gratuito |
| Insights | API de Claude | US$10 |
| Entrenamiento de modelos | GPU por hora (Modal o RunPod), solo cuando se entrena | US$50 a US$100 |

Son precios aproximados de planes de entrada; se confirman al crear las cuentas.

**Entornos:** local (todo con Docker Compose y datos de prueba), `staging` (se actualiza solo con cada cambio aprobado) y `production` (se actualiza solo con su aprobación).

**Despliegue:**

1. Cada PR corre en GitHub Actions: formato, tipos, pruebas y compilación de todo lo que toca.
2. Al entrar a `main`, se despliega solo a `staging`.
3. Pasar a `production` requiere un clic de aprobación de ustedes.
4. La app móvil sale por Expo: los cambios chicos se publican como actualización directa y las versiones nuevas pasan por las tiendas.
5. El software del club se publica como imágenes firmadas: primero a un club de prueba durante 48 horas y después a todos.

**Monitoreo y alertas:**

| Qué se mide | Alerta cuando |
| --- | --- |
| Cámaras grabando durante turnos | Una cámara está caída más de 5 minutos en un turno |
| Atraso de la cola de análisis por club | Supera 6 horas |
| Partidos publicados vs grabados | Un partido no se publica en 3 horas |
| Porcentaje de puntos que piden revisión | Supera el 15% en un día |
| Errores de la API | Más del 1% de los pedidos en 5 minutos |
| Pagos sin conciliar | Cualquier diferencia en el control nocturno |

Las alertas llegan por WhatsApp a soporte. La base tiene recuperación a cualquier momento de los últimos 7 días y los clips tienen versionado en R2.

## 14. Pruebas y criterios de aceptación

Una tarea está terminada cuando pasa sus pruebas automáticas, QA la revisó y cumple el criterio de aceptación de su módulo. Las pruebas son la red de seguridad que permite que 8 agentes cambien código todos los días sin romper lo anterior.

**Tipos de prueba:**

| Tipo | Herramienta | Qué cubre |
| --- | --- | --- |
| Unitarias | Vitest (TypeScript), pytest (Python) | Cada función con lógica: marcador, reglas del punto, fórmulas, disponibilidad, comisiones. Cobertura mínima del 80% en esos módulos |
| Contrato | Pruebas generadas desde OpenAPI | Que la API responda exactamente lo que dice el contrato |
| Integración | Testcontainers (PostgreSQL y Redis reales) | Reservas simultáneas, webhooks repetidos, colas |
| De punta a punta | Playwright (web), Maestro (app) | Reservar, jugar, recibir el WhatsApp, ver estadísticas, pagar el extra |
| Pipeline de IA | Partidos de referencia etiquetados | Las métricas de la sección 8; un cambio que baja una métrica no entra |
| Reglas del pádel | Casos escritos a mano | Al menos 60 situaciones de punto (contrapared, doble pique, reja en el saque, punto de oro, tie-break) con el resultado esperado |
| Equipo del club | Simulador de cámaras con videos grabados | Corte de internet de 48 horas, corte de luz a mitad de un análisis, disco lleno |
| Carga | k6 | 2.000 jugadores consultando disponibilidad a la vez sin superar 500 ms |

**Criterios de aceptación por módulo:**

| Módulo | Está listo cuando |
| --- | --- |
| Grabación | 50 turnos seguidos grabados sin perder ninguno, con 2 cámaras por cancha |
| Clips | El clip aparece en la app menos de 30 segundos después de apretar el botón |
| Publicación | Video y clips en 15 minutos y estadísticas en 2 horas después del turno, en el 95% de los partidos |
| Reservas | 1.000 intentos simultáneos sobre el mismo turno dan exactamente una reserva |
| Marcador | 9 de cada 10 puntos correctos sin corrección en los 15 partidos de referencia |
| Estadísticas | Un entrenador revisa 5 partidos y está de acuerdo con las 3 conclusiones principales de cada uno |
| Pagos | Cada pago aprobado aparece una sola vez y la conciliación nocturna da cero diferencias durante 2 semanas |
| App | Funciona en iPhone y Android de los últimos 5 años, y abre un partido en menos de 3 segundos con 4G |
| Panel del club | El dueño carga un turno de WhatsApp en menos de 20 segundos |

## 15. Operación: instalación, calibración y soporte

Un club nuevo pasa por 5 pasos, de la visita a la cancha funcionando, y después queda con soporte remoto. Cada paso tiene su lista en la consola interna, así cualquier instalador lo hace igual.

1. **Relevamiento (1 visita).** Fotos de cada cancha, medición del internet real (subida y bajada en 3 horarios), tipo de luminarias, lugar para soportes, recorrido de cables, toma de 220 V en la oficina y plano de vidrios y rejas. Si el internet no da 11 Mbps de subida de noche, se avisa al club que el video completo va a subir a pedido.
2. **Instalación (medio día por cada 2 canchas).** El electricista pasa cables y monta soportes; nuestro técnico conecta cámaras, switch, UPS y equipo, y registra el equipo en la consola con su número de serie.
3. **Calibración (15 minutos por cancha).** En la consola se marcan los 12 puntos de cada cámara; el sistema rechaza la calibración si el error supera 5 cm.
4. **Partido de prueba.** Se juega un partido de 20 minutos (pueden ser empleados del club) y se revisa que lleguen video, clips, marcador y estadísticas.
5. **Alta del club.** Se configuran reglas de reservas, cobros, logo y sponsor; se capacita al dueño y a la recepción (30 minutos) y se colocan los carteles con QR.

**Soporte:**

| Nivel | Quién | Resuelve | Tiempo de respuesta |
| --- | --- | --- | --- |
| 1 | Agente de IA de soporte por WhatsApp | Preguntas de jugadores y del club, reenvío de links, correcciones simples | Inmediato |
| 2 | Ustedes, desde la consola | Reprocesos, recalibración, problemas de pago, reinicio remoto del equipo | 4 horas hábiles |
| 3 | Técnico en el club | Cámara rota, cable cortado, equipo que no enciende | 48 horas, con equipo de repuesto |

**Mantenimiento:** limpieza de lentes y revisión de soportes una vez por mes (la puede hacer el club con una guía), y stock de repuesto de 1 cámara cada 10 canchas instaladas y 1 equipo de club cada 5 clubes.

**Manuales de fallas frecuentes:** cámara sin imagen, equipo sin internet, disco lleno, calibración movida, marcador con muchos puntos dudosos y pago no acreditado. Cada uno tiene en la consola los pasos de diagnóstico y el botón de acción correspondiente.

## 16. Pantallas

Estas son todas las pantallas de la primera versión; el diseño visual se define cuando exista la marca.

| Producto | Pantallas |
| --- | --- |
| App y web del jugador | Ingreso, perfil y categoría, inicio (próximo turno y último partido), buscar club y turno, confirmar reserva y seña, invitar jugadores, mis reservas, partido (video con línea de tiempo por punto, marcador, "este soy yo", corregir marcador), clips, estadísticas e insights, reel, historial y evolución, ranking del club, clases (reservar y pagar), notificaciones, ajustes y privacidad |
| App del entrenador | Agenda de clases, alumnos, clase grabada con mejoras por golpe, editor de clip (cámara lenta, dibujo, notas), plan de ejercicios, cobros |
| Web del partido sin cuenta | Link de WhatsApp que muestra el partido y pide ingresar para ver estadísticas o descargar |
| Panel del club | Inicio (canchas en vivo, turnos del día, alertas), calendario de reservas, carga rápida de turno, configuración de canchas y precios, cobros y planes, entrenadores, ranking, streaming de torneos, marca y sponsors, ingresos y liquidaciones, usuarios del staff |
| Consola interna | Clubes y contratos, equipos y cámaras, calibración, cola de análisis y reprocesos, puntos para revisar, etiquetado, liquidaciones y facturas, alertas, manuales de fallas |

## 17. Lo que todavía falta definir

- Nombre e identidad de la marca: define dominio, nombre de la app en las tiendas, colores, tipografía y estilo de los reels.
- Rangos de referencia del modo clase y catálogo de consejos: se definen con 2 o 3 entrenadores durante el piloto.
- Velocidad real del pipeline en la GPU del club: se mide en la fase 0 (sección 4).
- Cotización del hardware con proveedores locales.
