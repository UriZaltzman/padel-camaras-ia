# Sistema de cámaras con IA para canchas de pádel

Oct 16, 2026 · @Uri

## Resumen

Vamos a construir un combo para clubes de pádel en Argentina: cámaras fijas en cada cancha, más una plataforma con IA que graba cada partido, detecta jugadores y pelota, y le entrega a cada jugador su video, sus mejores jugadas y estadísticas de dónde ganó y perdió los puntos.

El video de referencia es un promo de trama.dev. Muestra exactamente eso: una cámara que "aprende a mirar" (detecta CANCHA, JUGADORES y PELOTA), y después del partido explica "dónde se fue el partido", qué lado atacó el rival y "la red que nadie cubrió". No pude abrir el sitio de trama.dev, así que la ingeniería inversa sale del video y de los competidores que sí están documentados.

La propuesta para el club: instalamos el kit en comodato o se lo vendemos, el club paga un abono mensual por cancha y los jugadores usan todo gratis, salvo que el club decida cobrarles un extra. Arrancamos en CABA y provincia de Buenos Aires, solo con pádel. La primera versión es completa: grabación, clips, estadísticas con IA, reservas, app y web del jugador, herramientas y cobro de clases para entrenadores, y panel del club.

## Decisiones tomadas

Estas respuestas salen del cuestionario del 16/10/2026 y mandan sobre cualquier otra parte del documento.

| Tema | Decisión |
| --- | --- |
| Zona | CABA y provincia de Buenos Aires, varios clubes interesados |
| Deporte y país | Solo pádel y solo Argentina al inicio |
| Planes | Comodato y compra; el trato final se negocia con cada club |
| Quién paga | El club. Los jugadores usan todo gratis, salvo que el club decida cobrarles un extra |
| Venta e instalación | La hacen ustedes, contratando un electricista |
| Canchas | Techadas y al aire libre, con lugar para soportes e iluminación LED |
| Internet | Flojo; el equipo se conecta al WiFi del club, procesa en el club y sube el video de noche |
| Reservas | Hoy por WhatsApp. Sumamos reservas propias en la app, para que el jugador tenga todo en un lugar |
| Turnos | De 1 hora, 1 hora y media o 2 horas, configurables por club |
| Gabinete | En la oficina del club |
| App | App para iPhone y Android, y también web |
| Ingreso | Varias opciones: WhatsApp, Google, Apple y email |
| Vínculo al partido | QR de la cancha, o automático por la reserva |
| Videos | El jugador los descarga; el completo se guarda 30 días, clips y estadísticas para siempre |
| Reel | Con logo del club y nuestra marca, sin música con derechos (a confirmar) |
| Nivel | Categorías argentinas, de 8va a 1ra |
| Social | Ranking del club y compartir a Instagram; feed y desafíos después |
| Privacidad entre jugadores | Cada uno ve solo los partidos que jugó con sus compañeros |
| Entrenadores | Modo clase con qué mejorar y sin puntos; pueden cobrar sus clases en la app; el plan lo define el club |
| Panel del club | Todo lo propuesto, más streaming de torneos, ranking, sponsors y apagar la grabación |
| Pantallas en el club | No al inicio; se ofrecen como adicional |
| IA, hardware, pagos, legal y desarrollo | Todo como la recomendación del cuestionario (preguntas 39 a 57) |
| Marca | Todavía no tiene nombre ni identidad |

El detalle técnico de cada parte (datos, algoritmos, API, seguridad, infraestructura, pruebas y operación) está en la [Especificación técnica del sistema](https://claude.ai/code/artifact/15969895-940c-46fe-bc61-0bf3dba33bc5).

## Ingeniería inversa: qué hace el producto y qué hace la competencia

El diferencial de trama.dev no es grabar: es convertir el partido en explicaciones tácticas. Grabar y cortar clips ya lo hace Beelup en Argentina; nosotros tenemos que ofrecer las dos cosas en un solo combo.

**Lo que muestra el video, pantalla por pantalla:**

| Pantalla del video | Función que hay detrás |
| --- | --- |
| "Vio algo", marcador 5-4 y 6-4 | Seguimiento del marcador por games y sets |
| «Jugamos bien.» / "Nadie lo vio entero. Ni vos." | Grabación completa del partido para revisarlo después |
| "El mismo lado." | Patrón de ataque: a qué jugador y a qué lado tira el rival |
| "La red que nadie cubrió." | Mapa de cobertura: zonas de la cancha que quedaron vacías |
| "Una computadora que aprende a mirar", etiquetas CANCHA · JUGADORES · PELOTA | Visión por computadora: calibración de cancha, detección de jugadores con confianza (0.9x) y trayectoria de la pelota |
| "Sin parpadear." | Análisis de todo el partido, cuadro por cuadro |
| "Dónde se fue el partido." (barras 3D por zona) | Mapa de calor de puntos perdidos por zona |
| "El próximo partido… / Si una cámara mirara tu partido…" | App del jugador con recomendaciones para el siguiente partido |

**Competidores y referencias:**

| Producto | Origen | Qué hace | Modelo de negocio |
| --- | --- | --- | --- |
| [Beelup](https://beelup.com/ar/club) | Argentina, 17 países | Graba, clips de hasta 1 minuto con botón, streaming a YouTube, marcador digital. 1 cámara WiFi por cancha de pádel | Abono mensual ARS 86.500 + kit ARS 179.000, o el club paga menos y el jugador ARS 3.000 por video ([Forbes](https://www.forbesargentina.com/negocios/beelup-empresa-argentina-revoluciona-deporte-amateur-expandio-17-paises-factura-us-1-millon-n59312)) |
| [PlaySight](https://playsight.com/our-sports/padel/) | Israel/EE.UU. | Multicámara, highlights automáticos, estadísticas (SmartScore), streaming 1080p/60, repetición tipo VAR, herramientas de entrenador | Venta a clubes, precio a consultar |
| [Padmi](https://elreferente.es/inversiones/padmi-levanta-541-000-euros-primera-ronda-inversion-liderada-dozen-investments/) | España | 2 cámaras por cancha, mapa de calor, fortalezas y debilidades, nivel, retos con premios | Instala gratis y cobra unos €1,5 por partido; reparte ganancia con el club |
| Padel Rec | Argentina (World Padel Center) | Graba y sube a la nube para revisar jugadas ([La Nación](https://www.lanacion.com.ar/economia/negocios/la-revancha-del-padel-el-deporte-que-volvio-como-industria-nid15112025/)) | No documentado |

La conclusión para el diseño: el club argentino ya entiende pagar un abono por cámaras (Beelup lo instaló en más de 2.500 canchas), pero nadie local ofrece estadísticas tácticas con IA. Ese es el hueco.

## Arquitectura punta a punta

El sistema tiene cuatro partes: las cámaras en la cancha, una computadora con GPU en el club, la plataforma en la nube y las apps de cada usuario. La decisión clave es que el club graba y analiza, y la nube guarda, cobra y entrega.

&#91;embedded content: arquitectura · cancha, club, nube y usuarios\]

Las cámaras le pasan el video al equipo del club; ese equipo sube a la nube el video, los clips y las estadísticas ya calculadas; la nube los entrega a cada usuario por la app, la web o WhatsApp.

## Pipeline de visión por computadora

El análisis corre en la nube después de cada partido y tiene siete etapas. No hace falta empezar de cero: proyectos abiertos como [Padex](https://padex.readthedocs.io/en/latest/guides/pipeline/) y [padel\_analytics](https://github.com/Joao-M-Silva/padel_analytics) ya resuelven las etapas 1 a 4 y sirven de base.

1. **Calibración de la cancha.** Se marcan 12 puntos de la cancha (líneas, red, esquinas) una sola vez por instalación y se calcula una homografía. Eso convierte píxeles en metros sobre un plano 2D de 10 x 20 m.
2. **Jugadores.** Un detector tipo YOLO encuentra a los 4 jugadores, ByteTrack les asigna un ID estable y se separan las parejas por lado de la cancha y color de ropa. El jugador se vincula a su cuenta cuando escanea el QR de la cancha.
3. **Pelota.** Un modelo TrackNet (usa 3 cuadros seguidos) detecta la pelota aunque sea chica y borrosa, y un filtro de Kalman rellena los cuadros donde se pierde detrás de un jugador o del vidrio.
4. **Eventos.** Se detectan los golpes (contacto jugador-pelota) y los botes, clasificados por superficie: piso, vidrio de fondo, vidrio lateral, reja o red.
5. **Tipo de golpe.** Con la pose del jugador (17 puntos del cuerpo) se clasifica cada golpe: saque, derecha, revés, volea, bandeja, víbora, smash, globo y salida de pared.
6. **Puntos y marcador.** Una máquina de estados con el reglamento de pádel (doble bote, pelota a la reja, golpe a la red, punto de oro) decide cuándo termina cada punto y quién lo ganó. Los jugadores pueden corregir el marcador desde la app y esas correcciones sirven para reentrenar.
7. **Estadísticas e insights.** Con todo lo anterior se calculan las métricas y un modelo de lenguaje las convierte en frases cortas como las del video.

**Estadísticas que entrega la versión completa:**

| Estadística | De dónde sale |
| --- | --- |
| Dónde se fue el partido: puntos perdidos por zona | Etapa 6 + posición del último golpe |
| La red que nadie cubrió: zonas sin cobertura | Posiciones de los jugadores en cada golpe rival |
| El mismo lado: a quién y hacia dónde ataca el rival | Dirección de cada golpe rival |
| Winners, errores no forzados y errores forzados | Etapa 6 + tipo de golpe |
| Tiempo en la red vs. en el fondo, subidas a la red | Posición en metros por jugador |
| Mapa de calor y distancia recorrida | Seguimiento de jugadores |
| Largo de los rallies y efectividad del saque | Etapas 4 y 6 |
| Velocidad de la pelota en smash y saque | Trayectoria de la pelota en metros |
| Mejores jugadas automáticas | Rallies largos, winners y smashes |

Lo más difícil técnicamente es la pelota (rápida, chica, tapada por el vidrio) y la etapa 6. Por eso la hoja de ruta empieza grabando partidos reales para entrenar y medir con datos propios.

**Modo clase:** en las clases no se cuentan puntos. El pipeline usa las etapas 1 a 5 y compara la pose de cada golpe con patrones de referencia, para marcar qué mejorar (posición, preparación, altura de contacto). Esta parte es nueva respecto de los competidores y conviene validarla con entrenadores del piloto.

## Funcionalidades por usuario

Hay cuatro tipos de usuario y cada uno tiene su propia pantalla. El jugador y el entrenador usan la app; el club usa un panel web; nosotros usamos una consola interna.

**Flujo de un partido, de punta a punta:**

1. El jugador reserva el turno en nuestra app (o la recepción lo carga en el panel) y la cámara arranca sola a la hora del turno.
2. Los jugadores quedan vinculados al partido por la reserva, o escaneando el QR de la cancha si no reservaron ellos.
3. Durante el partido, cualquiera aprieta el botón de la cancha (o toca la app) y se guarda un clip de los últimos 30 segundos.
4. Al terminar el turno, el equipo del club analiza el partido y sube los clips y estadísticas; el video completo sube de noche si el internet es flojo.
5. Cada jugador recibe un WhatsApp con el link: video, clips, estadísticas y reel vertical.
6. Si el club activó el cobro a jugadores, el análisis completo se desbloquea al pagar el extra con Mercado Pago.

**Jugador (app y web):**

- Ingreso con WhatsApp, Google, Apple o email; perfil con categoría (8va a 1ra), mano hábil y lado de juego (drive o revés).
- Reservas: ver turnos libres por club y cancha, reservar de 1 hora, 1 hora y media o 2 horas, invitar a los otros 3 jugadores y pagar la seña si el club la pide.
- Video completo del partido con línea de tiempo por punto, y saltos a cada punto ganado o perdido. Descargable.
- Clips del botón y mejores jugadas automáticas, descargables.
- Estadísticas del partido, mapas de calor e insights en frases ("perdiste 7 de 10 puntos cuando tu compañero quedó solo en la red").
- Reel vertical automático con el estilo del video de referencia, con el logo del club.
- Historial y evolución: cómo mejoran sus números partido a partido, y su nivel estimado.
- Comparación con su compañero, ranking del club y compartir a Instagram.
- Reservar y pagar clases con los entrenadores del club.
- Privacidad: cada jugador ve solo los partidos que jugó, con sus compañeros de ese partido.

**Entrenador:**

- Lista de alumnos y acceso a sus partidos y clases grabadas (con permiso del alumno).
- Modo clase: graba la clase sin contar puntos y la IA marca qué mejorar en cada golpe (posición, preparación, altura de contacto).
- Cámara lenta, dibujo sobre el video, notas de voz y de texto sobre un clip.
- Plan de ejercicios sugerido según las debilidades que marcan las estadísticas.
- Agenda de clases y cobro dentro de la app con Mercado Pago.
- Su plan lo define el club: incluido en el abono del club o pago mensual del entrenador.

**Club (panel web):**

- Estado en vivo de cada cámara y del equipo del club (grabando, sin internet, sin disco).
- Calendario de reservas: turnos de 1 hora, 1 hora y media o 2 horas, precios por horario, seña opcional y carga manual de turnos que llegan por WhatsApp.
- Configuración del cobro: todo gratis para los jugadores o un extra por partido, plan de entrenadores y cobro de clases.
- Ventas e ingresos: partidos grabados, reservas, cobros a jugadores y clases, con su liquidación.
- Marca propia en videos y reels (logo del club, sponsors) y streaming de torneos a YouTube.
- Ranking del club basado en estadísticas; fixture de torneos más adelante.
- Permisos: qué canchas y horarios graban, y apagar la grabación de un turno cuando el cliente lo pide.

**Nosotros (consola interna):**

- Alta de clubes, canchas y dispositivos, con calibración de cada cámara.
- Monitoreo de toda la flota y actualizaciones remotas del software del club.
- Facturación a clubes, liquidación de su parte de las ventas y soporte.
- Herramienta de etiquetado para corregir partidos y reentrenar los modelos.

## Hardware y presupuesto del combo

Un club de 4 canchas necesita unos US$4.300 de equipo, cerca de ARS 6,6 millones. Son precios estimados a partir de precios de lista y del sobrecosto habitual de importación, no cotizaciones: hay que validarlos con 2 o 3 proveedores locales antes de ofrecerlos. Tipo de cambio usado: ARS 1.535 por dólar oficial ([Rava, 9/10/2026](https://www.rava.com/cotizaciones/historico/dolar-oficial/2026/10/09/)).

**Por qué dos cámaras por cancha y no una:** Beelup usa una sola cámara porque solo graba. Para seguir la pelota y saber quién ganó cada punto hace falta ver bien las dos mitades de la cancha, y con una sola cámara la pareja del fondo lejano queda chica y tapada. Padmi también usa dos. Cada cámara va elevada (3 a 4 m) detrás de un vidrio de fondo, mirando hacia la cancha.

**Por qué una computadora con GPU en el club:** procesar en la nube cada partido de cada cancha se come el margen. Con una GPU en el club, el análisis corre ahí entre turnos y de noche, y a la nube solo suben los videos y los resultados. La nube queda como respaldo cuando el club se atrasa.

| Equipo | Cantidad | US$ estimado | ARS estimado |
| --- | --- | --- | --- |
| **Por cancha** |  |  |  |
| Cámara IP 8 MP (4K) PoE de exterior, lente 2,8 a 4 mm | 2 | 300 | 460.500 |
| Soportes elevados para detrás del vidrio de fondo | 2 | 120 | 184.200 |
| Botón inalámbrico para clips + cartel con QR | 1 | 40 | 61.400 |
| Cable UTP de exterior, caños e instalación | 1 | 180 | 276.300 |
| **Subtotal por cancha** |  | **640** | **982.400** |
| **Por club** |  |  |  |
| Computadora con GPU clase RTX 4060, 32 GB, disco de 2 TB | 1 | 1.300 | 1.995.500 |
| Switch PoE de 8 puertos | 1 | 130 | 199.550 |
| UPS de 1 kVA | 1 | 150 | 230.250 |
| Router 4G de respaldo | 1 | 100 | 153.500 |
| Gabinete con ventilación | 1 | 80 | 122.800 |
| **Subtotal por club** |  | **1.760** | **2.701.600** |
| **Club de 4 canchas** |  | **4.320** | **6.631.200** |

**Requisitos que le pedimos al club:** un toma de 220 V en la oficina para el gabinete, WiFi o cable al router del club e iluminación LED pareja. Como el internet de los clubes suele ser flojo, el equipo analiza todo en el club, sube clips y estadísticas apenas termina el turno y deja el video completo para la noche. El router 4G queda como respaldo. La instalación la hace un electricista que contratamos nosotros.

**Costo de nube estimado:** guardar un partido de 90 minutos en 1080p ocupa unos 4 GB. En almacenamiento sin costo de descarga (tipo Cloudflare R2) cuesta centavos de dólar por partido al mes, así que conviene guardar el partido completo 30 días y los clips para siempre. Son estimaciones a confirmar en el piloto.

## Modelo de negocio y precios

El club paga el servicio y los jugadores usan todo gratis. Si el club quiere, puede cobrarle un extra a cada jugador, y esa plata es del club. Ofrecemos dos planes, comodato y compra; los precios de abajo son de lista y el trato final se negocia con cada club.

**Planes para el club:**

| Plan | Equipo | Abono mensual por cancha | Contrato mínimo |
| --- | --- | --- | --- |
| Comodato | Sin costo; el equipo sigue siendo nuestro | ARS 180.000 | 24 meses |
| Compra | ARS 1,23 millones por cancha + ARS 3,38 millones por club (costo + 25%), en hasta 6 cuotas | ARS 90.000 | 12 meses |

Como referencia, Beelup cobra ARS 86.500 por mes y por cámara, solo por grabar y cortar clips. Nuestro abono incluye 2 cámaras por cancha, estadísticas con IA, reservas y app.

**Qué incluye el abono:** video completo y descargable, clips, estadísticas, reels, app y web para jugadores, reservas de turnos, panel del club, modo clase para entrenadores, streaming de torneos a YouTube, logo de sponsors, mantenimiento y soporte.

**Lo que decide cada club:**

| Opción | Qué elige el club | Cómo funciona |
| --- | --- | --- |
| Cobro a jugadores | Todo gratis, o un extra por jugador por partido que fija el club | Se paga con Mercado Pago en la app. El club recibe lo cobrado menos la comisión de Mercado Pago y un 10% nuestro |
| Plan entrenador | Incluido en su abono, o que cada entrenador pague ARS 25.000 por mes | Se configura desde el panel del club |
| Cobro de clases | Si los entrenadores cobran sus clases en la app | Mercado Pago reparte el pago: el entrenador recibe lo suyo y nosotros un 10% |
| Seña de reservas | Si el turno se reserva con seña pagada en la app | Sin comisión nuestra durante el piloto |
| Pantallas en el club | Repeticiones y rankings en una TV del club | Adicional que se ofrece después; precio a definir |

**Cuentas de un club de 4 canchas en comodato (estimadas):**

- Ingreso: 4 canchas x ARS 180.000 = ARS 720.000 por mes, unos US$470.
- Costos fijos estimados (nube, internet de respaldo, soporte): unos US$80 por mes, así que quedan unos US$390.
- El equipo (US$4.320) más la instalación con electricista se recuperan en unos 12 meses. Con un contrato de 24 meses, el segundo año es ganancia.
- En el plan de compra cobramos el margen del equipo por adelantado y unos US$235 por mes de abono.

El 10% sobre cobros a jugadores y clases es una propuesta para el piloto; si el club no cobra nada a los jugadores, el negocio se sostiene solo con el abono.

## Stack tecnológico

Propongo TypeScript para todo lo que es producto y Python solo para la IA. Con eso un equipo chico mantiene el sistema entero y comparte código entre la web y la app.

| Capa | Tecnología propuesta | Para qué |
| --- | --- | --- |
| Equipo del club | Ubuntu + Docker, FFmpeg/GStreamer para leer las cámaras por RTSP, agente en Python | Grabar, guardar los últimos minutos para los clips, procesar con la GPU y subir |
| Acceso remoto y actualizaciones | Tailscale (VPN) + actualizaciones por contenedores | Entrar a cualquier club sin ir y actualizar todos a la vez |
| IA | PyTorch, detector de jugadores, ByteTrack, TrackNet para la pelota, modelo de pose | Etapas 1 a 6 del pipeline |
| Backend | Node.js con NestJS, PostgreSQL, colas con Redis | Usuarios, clubes, reservas, partidos, clases, pagos y coordinación del procesamiento |
| Video | Cloudflare R2 para guardar + Cloudflare Stream o Mux para reproducir | Reproducción fluida en el celular sin costo de descarga |
| App del jugador | React Native con Expo | Una sola app para iPhone y Android |
| Web y panel del club | Next.js | Link del partido que se abre sin instalar nada, y panel del club |
| Pagos | Mercado Pago (pago único y suscripciones) | Lo que usa todo el mundo en Argentina |
| Mensajes | API de WhatsApp Business | Avisar "tu partido está listo" con el link |
| Insights en frases | API de Claude | Convertir los números en las frases cortas del video |
| Nube de respaldo para la IA | GPU por hora (Modal o RunPod) | Cuando un club se atrasa o para reprocesar |

**Ojo con las licencias:** los modelos YOLO de Ultralytics tienen licencia AGPL-3.0. Para un producto cerrado hay que pagar su licencia comercial o usar modelos con licencia Apache 2.0, como YOLOX o RT-DETR. Antes de reutilizar Padex o padel\_analytics hay que revisar sus licencias, porque sus páginas no las aclaran.

## Equipo de agentes de IA

El desarrollo lo hacen 8 agentes de IA, cada uno dueño de una parte del stack y de una carpeta del repositorio. Ustedes deciden qué se construye y aprueban cada entrega antes de que entre al producto.

&#91;embedded content: equipo de agentes · 8 roles y el camino de cada entrega\]

El Orquestador reparte las tareas, los cinco agentes constructores trabajan en paralelo y cada entrega pasa por QA antes de llegar a ustedes.

| Agente | Es dueño de | Stack | Entrega | Depende de |
| --- | --- | --- | --- | --- |
| 1. Orquestador | El plan y la integración | GitHub Issues y Projects | Tareas con criterio de "terminado" y un resumen semanal para ustedes | Ustedes |
| 2. Arquitecto | `packages/contracts`, esquema de base de datos, `docs` | OpenAPI, PostgreSQL, eventos entre servicios | Contratos de API y de datos, antes de que nadie programe | Orquestador |
| 3. Backend | `services/api` | Node.js con NestJS, PostgreSQL, Redis, Mercado Pago, WhatsApp, API de Claude | API, reservas, cobro de clases, pagos, avisos por WhatsApp e insights en frases | Arquitecto |
| 4. Club y DevOps | `services/edge-agent`, `infra` | Python, FFmpeg/GStreamer, Docker, Tailscale, Cloudflare R2 y Stream, Vercel, GitHub Actions | Agente del club, despliegues, actualizaciones remotas y monitoreo | Arquitecto |
| 5. Visión IA | `ml` | PyTorch, detector de jugadores, ByteTrack, TrackNet, modelo de pose | Pipeline de las 7 etapas, entrenamiento y métricas de precisión | Club y DevOps (videos grabados) |
| 6. App móvil | `apps/mobile` | React Native con Expo | App del jugador y del entrenador para iPhone y Android | Backend |
| 7. Web y paneles | `apps/web` | Next.js | Web del partido, panel del club y consola interna | Backend |
| 8. QA y Seguridad | `tests` y la revisión de todos los PR | Playwright, pytest, revisión de licencias | Tests, revisión de código y chequeo de datos personales | Todos |

**Reglas de trabajo del equipo:**

1. Un solo repositorio en GitHub. Cada agente modifica solo su carpeta.
2. Contratos primero: nadie programa contra la API hasta que el Arquitecto publica el contrato, y cualquier cambio de contrato pasa por él.
3. Cada tarea es un issue del Orquestador con su criterio de terminado. El agente trabaja en su propia rama y abre un PR.
4. QA corre los tests y revisa cada PR. Si el PR toca contratos, también lo revisa el Arquitecto.
5. Ningún PR entra a la rama main sin la aprobación de ustedes o del revisor humano que designen.
6. Cada agente tiene un archivo de rol (`.claude/agents/<rol>.md`) con su misión, su carpeta, su stack y lo que no puede tocar. Esos archivos son parte del prompt que les voy a armar.
7. Ningún agente compra equipos, firma con clubes, paga servicios, publica en las tiendas ni sube a producción sin el OK de una persona.

**Qué agentes trabajan en cada fase:**

| Fase | Agentes activos |
| --- | --- |
| 0. Grabar partidos reales | Orquestador, Club y DevOps, Visión IA |
| 1. Grabación y plataforma | Arquitecto, Backend, Club y DevOps, App móvil, Web y paneles, QA |
| 2. IA y marcador | Visión IA, QA |
| 3. Estadísticas y entrenador | Visión IA, Backend, App móvil, Web y paneles, QA |
| 4. Piloto pago | Orquestador, Club y DevOps, QA |

El Orquestador trabaja en todas las fases.

## Hoja de ruta de desarrollo

La versión completa se puede tener en un piloto pago a los 7 meses con el equipo de 8 agentes de IA y ustedes aprobando cada entrega. La plataforma y la IA se construyen en paralelo, y lo primero es grabar partidos reales, porque sin datos propios no se ajusta ni se mide la IA.

&#91;embedded content: hoja de ruta · 5 fases en 7 meses\]

| Fase | Qué se entrega | Cuándo está lista |
| --- | --- | --- |
| 0. Grabar partidos reales | 1 cancha de un club amigo con el equipo final, 20 a 30 partidos propios grabados y etiquetados (el entrenamiento arranca con videos de pádel existentes) | El hardware graba bien de día y de noche, y se midió la velocidad del pipeline en la GPU del club |
| 1. Grabación y plataforma | Equipo del club, subida, reservas, app y web del jugador, QR, botón de clips, panel del club, Mercado Pago, WhatsApp | Un jugador recibe su video y sus clips sin ayuda |
| 2. IA y marcador | Calibración, jugadores, pelota, golpes, botes y marcador automático | Medido contra los partidos etiquetados de la fase 0 |
| 3. Estadísticas y entrenador | Estadísticas, insights en frases, reel vertical, modo clase y cobro de clases del entrenador | Los jugadores del club piloto entienden y usan las estadísticas |
| 4. Piloto pago | 3 a 5 clubes con 10 a 20 canchas en comodato, precios reales | Los números del modelo de negocio se confirman |

**Equipo:** el desarrollo lo hacen los 8 agentes de la sección Equipo de agentes de IA. Además siguen haciendo falta tres roles humanos:

| Rol humano | Dedicación | Qué hace |
| --- | --- | --- |
| Ustedes | Parcial | Deciden qué se construye, aprueban cada entrega, venden a clubes y hablan con jugadores y entrenadores |
| Instalador / técnico | Parcial | Relevamiento de clubes, instalación y soporte en sitio |
| Revisor técnico (recomendado) | Unas horas por semana | Revisa lo más delicado: visión por computadora, seguridad e infraestructura |

Los agentes trabajan en paralelo, así que el ritmo real lo marca lo rápido que ustedes revisan y aprueban las entregas.

## Riesgos y preguntas abiertas

El riesgo más grande es la precisión de la IA, no la grabación. Si el marcador o las estadísticas fallan seguido, el jugador deja de pagar.

| Riesgo | Cómo lo manejamos |
| --- | --- |
| La pelota se pierde (rápida, tapada por el vidrio o un jugador) | Dos cámaras por cancha, entrenamiento con partidos propios y corrección del marcador desde la app |
| El club tiene mala luz o mal internet | Relevamiento antes de instalar; subida de noche y router 4G de respaldo |
| Datos personales e imagen de los jugadores (Ley 25.326) | Cartel visible en la cancha, aceptación de términos al escanear el QR, bloqueo de grabación a pedido |
| Robo o roturas del equipo | Cámaras altas con protección, gabinete con llave y seguro incluido en el comodato |
| Tipo de cambio e importación del hardware | Equipo cotizado en dólares y abono actualizado por índice cada 3 meses |
| Competencia de Beelup, ya instalado en muchos clubes | Vender por las estadísticas, que Beelup no tiene, y por incluir reservas y app en el mismo abono |

**Lo que queda abierto:**

- [ ] Nombre e identidad de la marca (puedo armar una propuesta de nombres y logo).
- [ ] Nombres de los clubes y cantidad de canchas de cada uno, para planificar el piloto.
- [ ] Validar los precios de lista (abono, compra y 10% de comisión) con los primeros clubes.
- [ ] Cotizar el equipo con 2 o 3 proveedores locales.
- [ ] Confirmar si el reel lleva música y de qué tipo.

## Fuentes

- [Beelup para clubes](https://beelup.com/ar/club)
- [Forbes Argentina sobre Beelup](https://www.forbesargentina.com/negocios/beelup-empresa-argentina-revoluciona-deporte-amateur-expandio-17-paises-factura-us-1-millon-n59312)
- [PlaySight Padel SmartCourt](https://playsight.com/our-sports/padel/)
- [PlaySight y sus nuevas funciones de IA](https://thepadelstate.com/playsight-looks-to-revolutionize-padel-with-new-ai-features/)
- [Padmi en El Referente](https://elreferente.es/inversiones/padmi-levanta-541-000-euros-primera-ronda-inversion-liderada-dozen-investments/)
- [La Nación: la revancha del pádel](https://www.lanacion.com.ar/economia/negocios/la-revancha-del-padel-el-deporte-que-volvio-como-industria-nid15112025/)
- [Padex, pipeline de análisis de pádel](https://padex.readthedocs.io/en/latest/guides/pipeline/)
- [padel\_analytics en GitHub](https://github.com/Joao-M-Silva/padel_analytics)
- [Dólar oficial en Rava](https://www.rava.com/cotizaciones/historico/dolar-oficial/2026/10/09/)
