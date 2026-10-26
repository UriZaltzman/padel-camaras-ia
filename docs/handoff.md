# Traspaso del proyecto (26/10/2026)

Este documento resume todo lo necesario para seguir el proyecto desde cero, sin ningún chat previo. Se lee junto con `CLAUDE.md`, `docs/prompt-maestro.md`, `docs/especificacion-tecnica.md` y `docs/estructura.md`.

## 1. Quién sos y cómo trabajás

- Sos el **Orquestador** de 8 agentes: arquitecto, backend, club-devops, vision-ia, app-movil, web-paneles, qa-seguridad y orquestador (definidos en `docs/prompt-maestro.md` y `.claude/agents` / `.codex/agents`). Cada agente toca solo su carpeta (tabla en `CLAUDE.md`).
- El dueño del producto es Uriel (uri.zaltzman@gmail.com). Habla en español rioplatense.
- **Lo que nunca se hace sin el OK explícito de una persona:** comprar equipos o servicios, crear cuentas pagas, firmar o escribirle a clubes, publicar en las tiendas, desplegar a producción, borrar datos reales.
- **Los merges los hace el dueño**, con "Create a merge commit", y después tiene que tocar "Confirm merge" (muchas veces se olvida). Verificá siempre con `gh pr view <n> --json state,mergeCommit` que quedó mergeado. Los agentes nunca mergean.
- Un PR con varias líneas `Closes #1, #2` solo cierra el primero: poné cada `Closes #n` en su propia línea y cerrá a mano los que queden abiertos.
- Los chequeos de CI son obligatorios: sin "TypeScript (affected packages)" en verde GitHub no deja mergear.

## 2. Qué es el producto

Plataforma para clubes de pádel de Buenos Aires, en **tres apartados** más un módulo de IA:

1. **Super Admin (consola interna de la empresa):** alta del club en el lugar con cobro, enlace whitelabel, configurador modular (seña, branding, clases en app o WhatsApp, IA y video, torneos), consumo e infraestructura con precio por tramos de jugadores activos, finanzas B2B con suspensión por mora, flota de cámaras, calibración, cola de procesamiento, revisión de puntos dudosos, auditoría, usuarios internos.
2. **Panel del club (web, CRM):** grilla diaria y semanal sin dobles reservas, calendario de 365 días con bloqueos, caja del día, carga manual de turnos, CRM de jugadores con WhatsApp, clases con profesores, torneos de 1ª a 6ª, ranking interno, Smart Court, configuración, suscripción.
3. **App del jugador (Expo, iPhone y Android) y web del jugador:** registro, mapa de Buenos Aires con logos de clubes, favoritos con las reservas debajo de cada club en el inicio, reservar (60, 90 o 120 minutos), pagar seña y saldo con Mercado Pago, recordatorio 1 hora antes, clases, torneos, QR de la cancha, estadísticas y videos de sus partidos.
4. **Smart Court (IA):** **2 cámaras por cancha** (una detrás de cada vidrio de fondo), computadora con GPU en el club, detección de jugadores y pelota, marcador automático, estadísticas, highlights y consejos. Marca provisoria: `rebote` (vive solo en `packages/config/brand.ts` y `brand.py`).

## 3. Repositorio y cómo correrlo

- Repo: github.com/UriZaltzman/padel-camaras-ia (público). Tablero: github.com/users/UriZaltzman/projects/1 (campo Estado: Pendiente, En curso, En revisión, Esperando aprobación, Listo).
- Monorepo pnpm + Turborepo (TypeScript) y uv (Python). `apps/web` (Next.js + Tailwind: panel, consola y web del jugador), `apps/mobile` (Expo), `services/api` (NestJS + Prisma + Postgres + Redis), `services/edge-agent` (equipo del club), `ml` (visión), `packages/contracts` (OpenAPI), `packages/ui`, `packages/config`, `infra`.
- Si `pnpm` no existe en la terminal: `corepack enable && corepack prepare pnpm@9.15.0 --activate`, o usar `corepack pnpm ...`.
- Web en modo de prueba (sin base): `cd apps/web && NEXT_PUBLIC_API_MOCK=true pnpm dev` y abrir `http://localhost:3001/ingresar`. Panel: `/panel/clubes/01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60/calendario` (y `/caja`, `/jugadores`, `/torneos`, `/canchas`, `/marca`, `/calendario/anual`). Consola: `/admin/clubes`, `/admin/clubes/nuevo`, `/admin/consumo`, `/admin/tarifas`, `/admin/cotizador`. Jugador: `/reservar`.
- Todo de punta a punta con la API real y 3 clubes de ejemplo: `pnpm e2e:full` (necesita Docker).
- Tests: `pnpm -r lint && pnpm -r typecheck && pnpm -r test`, `uv run --directory ml pytest`, Playwright en `apps/web` (`pnpm exec playwright test`).

## 4. Estado a hoy

106 PRs mergeados, 119 issues cerrados, 125 abiertos. No hay PRs abiertos. **No hay nada desplegado, ni cuentas reales de Mercado Pago, WhatsApp o mapas, ni clubes cargados, ni cámaras instaladas.** Todo corre con proveedores de prueba.

**Hecho y en `main`:**
- **Cimientos:** monorepo y CI (licencias sin AGPL, contratos al día, imagen del equipo del club, simulador de cámaras), contratos OpenAPI con tipos generados, sistema de diseño y marca.
- **API:** login por WhatsApp, **login por email y contraseña con Argon2id** (bloqueo, recuperación, segundo factor TOTP obligatorio para personal interno; `docs/security/password-login.md`), sesiones, clubes, canchas y roles; **RLS en todas las tablas con FORCE y una guarda de CI que falla si una tabla nueva queda sin protección** (`docs/security/rls-matrix.md`); reservas con **restricción de exclusión en Postgres** que impide superposiciones (probado con miles de combinaciones de 60/90/120 minutos), reservas temporales de 10 minutos, horizonte de 14 días para el jugador y 365 para el club, bloqueos de cancha, cancelación, no-show y reembolso; checkout y webhook de Mercado Pago con firma, abono del club por tramos de jugadores activos, medición de consumo, WhatsApp (recordatorio 1 hora antes), CRM, favoritos, partidos y ranking Glicko-2, ranking del club, clases (agenda, notas, solicitud en app o WhatsApp, plan del profe), torneos completos.
- **Panel del club (web):** calendario de turnos, calendario anual, caja, CRM con WhatsApp, torneos, marca y sponsors.
- **Consola interna (web):** clubes y contratos, alta in situ, configurador de módulos, consumo y tarifas.
- **App del jugador:** ingreso, inicio con favoritos, mapa, buscar y reservar, notificaciones, partido con video, "este soy yo", QR de la cancha, torneos.
- **Equipo del club e IA:** grabador de segmentos y subida reanudable, simulador de cámaras, guía del kit de la fase 0, herramientas de etiquetado, **motor de puntos y marcador** (7 reglas, 3 capas de corrección, 88 casos de reglas, simulador de partidos con ruido; `docs/ml/score-engine.md`) y **geometría y eventos** (calibración por homografía, filtro de Kalman, triangulación con 2 cámaras, detección de golpes y rebotes, simulador físico; `docs/ml/algorithm-measurements.md`).
- **Ola 0 del plan:** base responsive y matriz de 7 dispositivos de Playwright (`docs/testing/responsive.md`), entorno completo de pruebas (base con 3 clubes, docker compose, `pnpm e2e:full`, textos por módulo) y login con contraseñas.

## 5. Lo que falta

- **12 decisiones del dueño (issues `decision-needed`):** #2 club amigo, #3 kit de cámaras, #80 cuentas en la nube, #119, #141, #142, #182 nombre definitivo, #183 clubes piloto y cotizaciones, #196 licencia de FFmpeg, #198 umbrales de la IA, #220 huecos de la máquina de estados, #242 ventana de reembolso (por cancha o por club). También: puntos del ranking de torneos y montos finales de los tramos de precios (hoy son valores de prueba marcados así).
- **5 cierres de fase:** #19, #118, #140, #181, #193.
- **108 issues por construir** (fase 0: 1, fase 1: 52, fase 2: 10, fase 3: 32, fase 4: 11, sin fase: 2), unos 53 libres para empezar. Incluyen los nuevos: #334, #335 y #336 (pago del saldo al llegar, con confirmación del dueño y registro en el CRM), #327 al #332 (huecos de la especificación: cambio de teléfono y fusión de cuentas, baja de empleados y transferencia de propiedad, importar jugadores desde CSV, baja de un club, versión mínima de la app, límites anti-abuso), #315 (contrato del QR de la cancha, sin el cual el QR solo funciona con datos de prueba), #304 (documentar bloqueos y horizonte en el contrato) y el tracker #345.
- **IA:** falta el detector neuronal de la pelota (mitad del #124), entrenar con partidos reales, medir contra 15 partidos propios apartados (`docs/especificacion-tecnica.md`, métricas mínimas) y el resto de las etapas de visión (unas 15 abiertas). No se puede probar con video real hasta tener el club amigo y el kit (#2 y #3). Descargar el dataset público PadelTracker100 (CC BY 4.0, unos 7,1 GB, Zenodo) necesita el OK del dueño.
- **Pantallas:** las del lienzo todavía no están conectadas a la API real ni al login (el panel avisa "Vista de prueba"). Es el trabajo de las olas 1 a 5.
- Conocido: salvedades de partes cerradas pero incompletas (clases: falta la invitación por WhatsApp y los endpoints de aceptación del alumno; alta del club: no sube la foto del comprobante ni pide horarios de apertura; la regla opcional contra huecos de 30 minutos existe en el código pero falta su configuración por club en la base).

## 6. Decisiones ya tomadas

- Se cobra al club por **cantidad de jugadores activos** (tramos a 90 días, con ajuste trimestral por inflación).
- El recordatorio de reserva sale **1 hora antes**.
- **2 cámaras por cancha** para el piloto (la versión de 1 cámara es un plan económico futuro).
- Se sigue con **TypeScript** (Next.js, Expo, NestJS); no se reescribe en HTML/CSS/JS puros.
- Contraseñas con Argon2id; los jugadores entran con código de WhatsApp o Google/Apple, sin contraseña.
- Solo licencias permisivas (Apache 2.0, MIT): nada AGPL (por eso no se usa Ultralytics YOLO).
- Primero se entrena con videos existentes y después con 20 a 30 partidos propios (ADR 0002).
- Sin reconocimiento facial; el jugador se identifica con "este soy yo".

## 7. Plan de 5 olas (pantallas responsive, funcionales y verificadas)

Objetivo: construir todas las pantallas de los tres lienzos de diseño, **responsive en cualquier dispositivo**, con sus funciones conectadas a la API real y **verificadas con Playwright**. Se divide en partes que no tocan los mismos archivos, para evitar conflictos. Máximo 4 sesiones a la vez y una ola empieza solo cuando la anterior está mergeada y verificada en `main`.

**Reglas responsive** (detalle en `docs/testing/responsive.md`): puntos de corte teléfono <640, tablet 640 a 1023, laptop ≥1024, escritorio ≥1440; contenedores fluidos y `100dvh`; áreas seguras; toques de 44 px o más; campos de 16 px; navegación que pasa de lateral a hamburguesa o barra inferior; tablas que pasan a tarjetas; modales como hojas en teléfono; la grilla de turnos muestra una cancha por vez en teléfono. **Dispositivos de prueba:** iPhone chico (375, WebKit), iPhone actual (390 a 430), Android (360 a 412), iPad vertical (768), iPad horizontal (1024), laptop (1280, Chromium y Firefox), escritorio (1440). Cada pantalla verifica: sin scroll horizontal, nada cortado, toques de 44 px, sin errores de consola, accesibilidad y capturas.

**Ciclo que se corrige solo, en cada tramo:** construir según el lienzo → correr Playwright en todos los dispositivos → si falla, leer la traza y la captura, corregir la causa (no el test, salvo que estuviera mal) y volver a probar → máximo 5 vueltas; si no queda en verde, frenar y abrir un issue con la traza → PR con CI en verde. Además hay un mapa de cobertura pantalla-ruta-prueba (`apps/web/e2e/coverage-map.json`) y un chequeo de CI que falla si una pantalla no tiene prueba.

| Ola | Tramos | Condición para pasar a la siguiente |
| --- | --- | --- |
| 0 (**hecha**) | 0A base responsive y Playwright por dispositivo; 0B login con contraseñas; 0C entorno completo de pruebas y textos por módulo | Mergeadas y verificadas |
| 1 | **A1** app del jugador: entrada e inicio con favoritos; **B1** panel del club: login, inicio y grilla; **C1** consola: clubes y alta; **D** web del jugador | Cada tramo en verde en los 7 dispositivos y con su cobertura al 100% |
| 2 | **A2** buscar y reservar con pago del saldo; **B2** calendario, bloqueos, turnos fijos y caja; **C2** módulos, consumo y finanzas | Igual, más una prueba que reserva con duraciones mezcladas y paga el saldo |
| 3 | **A3** clases, torneos y ranking; **B3** CRM, clases y torneos; **C3** Smart Court, calibración y auditoría | Igual a la ola 1 |
| 4 | **A4** Smart Court en la app; **A5** cuenta y privacidad; **B4** Smart Court, configuración y suscripción del club | Igual a la ola 1 |
| 5 | Pasada final de todo en todos los dispositivos, accesibilidad, rendimiento y revisión contra los lienzos | Criterios de salida |

**Criterios de salida del plan:** todas las pantallas de los tres lienzos con ruta y prueba (cobertura 100%); Playwright en verde en los 7 dispositivos; cero scroll horizontal, cero elementos cortados, toques de 44 px y sin violaciones graves de accesibilidad; contraseñas solo como hash Argon2id y nunca en logs; flujos con dinero y con datos de otros clubes probados contra la API real.

**Qué incluye cada tramo, en una línea:** A1 ingreso, inicio con "Mis clubes favoritos" y reservas debajo de cada uno, estado vacío, editar favoritos. B1 login del club (email y contraseña), inicio del día, grilla diaria con duraciones mezcladas y detalle del turno con cobro del saldo. C1 lista y ficha de clubes y alta in situ de 5 pasos. D la web del jugador (reservas, partidos, estadísticas). A2 mapa, buscar, elegir horario (60/90/120 con ventanas ocupadas en gris), pagar seña y saldo con Mercado Pago. B2 calendario anual, bloqueos con política sobre reservas, turnos fijos, caja. C2 configurador de módulos, consumo y tarifas, finanzas B2B con mora. A3 clases, torneos, ranking. B3 CRM, clases, torneos. C3 flota de 2 cámaras por cancha, calibración de 12 puntos, cola, revisión de puntos dudosos, auditoría. A4 QR, estados "procesando"/"en revisión", estadísticas, mapa de calor, clips, "este soy yo". A5 perfil, notificaciones, privacidad, medios de pago. B4 Smart Court del club, configuración, marca, personal y suscripción.

## 8. Cómo se trabaja (lecciones aprendidas)

- Una sesión (agente) por grupo de issues que tocan los **mismos archivos**, con un commit por issue y un solo PR. Los PRs apilados que se mergean sobre otra rama **no llegan a `main`** (pasó una vez): cada PR apunta a `main`.
- Dos sesiones que modifican el mismo módulo a la vez generan conflictos (`app.module.ts`, contratos y `generated/`). Los textos ya están separados por módulo para evitarlo; traer `main` (merge, no rebase) antes de abrir cada PR.
- Cada sesión espera su propio CI (`gh pr checks --watch`) y arregla lo que falle antes de reportar. Nunca mergea.
- Los tests no pueden depender de la fecha real: se arregló un fallo por eso (#349); todo reloj va inyectado.
- Un test intermitente tumbó varios PRs; se subió el límite de tiempo de los tests de la app a 20 segundos.
- Cuando un issue queda "cerrado" pero incompleto, se crea un issue de seguimiento (pasó con #260, #267, #153).
- El modelo por defecto para las sesiones es Sonnet, con esfuerzo alto en seguridad, base de datos y cadenas del backend.

## 9. Lo que depende del dueño

- Mergear cada PR ("Create a merge commit" + "Confirm merge") y revisar los tres lienzos de pantallas, que ninguna sesión miró renderizados.
- Las 12 decisiones, más los puntos del ranking de torneos y los precios finales.
- **Cuentas reales:** Mercado Pago, WhatsApp oficial (plantillas de Meta), mapas, proveedor de email (hoy los enlaces de recuperación de contraseña no se envían en producción: `TODO_COTIZAR`), secretos `AUTH_PASSWORD_PEPPERS`, `AUTH_TOTP_ENCRYPTION_KEY` y `HTTP_TRUST_PROXY_HOPS`.
- Comprar el kit de cámaras y elegir el club amigo (#2 y #3); firmar con clubes.
- Un abogado para audio, menores y Ley 25.326.

## 10. Documentos que viven solo en las cuentas del dueño (no están en GitHub)

Son privados y los puede leer otro chat solo si tiene acceso a esa cuenta. **Conviene exportarlos al repo** (ver sección 11):

- Documento maestro con los 204 issues: https://claude.ai/artifact/7CBExM4aZGQ6v8qjcC44AY
- Especificación funcional y técnica (sitemap, pantallas, anti-doble reserva, fórmula de precio, journeys, edge cases, huecos): https://claude.ai/artifact/R2KqUVxkJU9k4oXQAX5TzW
- Esquema técnico de la IA (cámaras, instalación, luz, pipeline, algoritmos A1 a A9, datos, entrenamiento, demo): https://claude.ai/artifact/YFPwEuBsGEXsBf9b61PBZE
- Plan de construcción (olas, responsive, login, Playwright): https://claude.ai/artifact/CQWPhLxNS4mHiEzE42WvKW
- Lienzos de diseño: Jugador (101 pantallas) https://claude.ai/artifact/JhHCR5T6RX9N6X2SGCNeVK · Club (56) https://claude.ai/artifact/KWpdtys5hGYx3qDQwaM6Ze · Super Admin (53) https://claude.ai/artifact/CVs9TnP8fJy4zhqjsYcNUU
- Propuesta comercial https://claude.ai/code/artifact/04cc5a15-da6c-41cf-bfdd-ffe27da1249e · mapa de pantallas https://claude.ai/artifact/29Ek5oV7tur7jsxnpHhxKu

## 11. Para que GitHub sea autosuficiente (pendiente)

1. Exportar a `docs/` las cuatro piezas de texto de la sección 10 (especificación funcional, esquema de la IA, plan de olas y documento maestro) como Markdown, para que el repo sea la fuente de verdad.
2. Exportar los tres lienzos de diseño como archivos (HTML por pantalla o imágenes) a una carpeta `docs/diseno/` con un índice pantalla → ruta, que alimenta el mapa de cobertura de Playwright.
3. Guardar en el repo la lista de issues nuevos y el estado de las olas en el tracker #345 y en `docs/progreso.md` (hoy desactualizado, de la primera semana).
4. Sumar a `docs/pendientes.md` los secretos y las cuentas de la sección 9.

## 12. Primer paso al retomar

Leer `CLAUDE.md`, `docs/prompt-maestro.md` y este archivo; actualizar `docs/progreso.md` y el tablero; confirmar con el dueño que mergeó todo; y, si pide seguir, **lanzar la ola 1** (A1, B1, C1 y D en paralelo, una sesión por tramo, con el ciclo que se corrige solo).
