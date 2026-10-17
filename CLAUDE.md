# CLAUDE.md

Guía del repositorio para todos los agentes. Se lee entera al empezar cada tarea. Si algo de acá contradice a `docs/especificacion-tecnica.md`, manda la especificación y se avisa al Arquitecto para corregir esta guía.

## Qué estamos construyendo

Un combo para clubes de pádel de CABA y provincia de Buenos Aires: 2 cámaras por cancha, una computadora con GPU en el club y una plataforma que graba cada turno, detecta jugadores y pelota, arma el marcador solo, y le da a cada jugador su video, sus clips, sus estadísticas y un reel. Incluye reservas de turnos, cobro de clases de entrenadores, modo clase y panel del club. Paga el club; los jugadores usan todo gratis salvo que el club active un extra.

Nombre de la marca: provisorio (`rebote`). Vive solo en `packages/config/brand.ts` y `brand.py`. Ver `docs/marca.md` y `docs/pendientes.md`.

## Documentos que mandan

| Documento | Para qué |
| --- | --- |
| `docs/estructura.md` | Qué se construye y por qué: decisiones, funcionalidades, negocio, equipo, fases |
| `docs/especificacion-tecnica.md` | Cómo se construye: datos, algoritmos, API, seguridad, infra, pruebas, pantallas |
| `docs/marca.md` | Colores, tipografía, logo, tono |
| `docs/pendientes.md` | Valores provisorios (`BRAND_NAME`, `TODO_CLUB`, `TODO_COTIZAR`) y datos de prueba |
| `docs/adr/` | Decisiones de arquitectura nuevas (una por archivo, `NNNN-titulo.md`) |

## Carpetas y dueños

Cada agente modifica solo su carpeta. Si una tarea necesita un cambio en otra carpeta, abre un issue para el dueño en vez de tocarla.

| Carpeta | Dueño |
| --- | --- |
| `packages/contracts`, `docs`, `services/api/prisma/schema.prisma` | arquitecto |
| `services/api` (salvo el schema) | backend |
| `services/edge-agent`, `infra` | club-devops |
| `ml` | vision-ia |
| `apps/mobile` | app-movil |
| `apps/web` | web-paneles |
| `packages/ui` | web-paneles (con revisión de app-movil) |
| `packages/config` | arquitecto |
| `tests/e2e`, `tests/load`, `tests/rules`, `.github/workflows` de tests | qa-seguridad |
| Issues, tablero, `docs/progreso.md` | orquestador |

## Reglas del equipo

1. Un solo repositorio. Cada agente toca solo su carpeta.
2. Contratos primero: nadie programa contra la API hasta que el Arquitecto publica el contrato en `packages/contracts`. Todo cambio de contrato pasa por él.
3. Cada tarea es un issue con criterio de "terminado". Una rama por issue (`<agente>/<numero>-<titulo-corto>`), un PR chico por rama.
4. QA revisa cada PR y corre los tests. Si toca contratos o el schema, también revisa el Arquitecto.
5. Nada entra a `main` sin aprobación humana.
6. Nadie compra equipos, firma con clubes, paga servicios, publica en tiendas ni sube a producción sin el OK de una persona.
7. Ante una duda que cambia lo que ve el usuario o el negocio, se pregunta en el issue y se sigue con lo que no depende de la respuesta.

## Convenciones

| Tema | Regla |
| --- | --- |
| Idioma | Código, nombres, commits y PR en inglés. Textos de usuario en español rioplatense con voseo, en archivos `es-AR`, nunca en el código |
| Fechas | Se guardan en UTC, se muestran en `America/Argentina/Buenos_Aires` |
| Plata | Enteros en centavos de ARS (`amount_cents`). Nunca decimales |
| IDs | UUID v7 |
| Errores | Código estable en mayúsculas (`BOOKING_SLOT_TAKEN`) + mensaje para el usuario + detalle en el log |
| Logs | JSON con `request_id`, `club_id`, `match_id`. Nunca datos personales ni tokens |
| Configuración | Variables de entorno validadas al arrancar (Zod / Pydantic Settings). Secretos solo en el gestor de secretos, nunca en el repo |
| Umbrales de IA | Solo en `ml/config/thresholds.yaml`. Ningún número mágico |
| Commits | Conventional Commits: `feat(bookings): add hold expiration` |
| Pruebas | Toda lógica de negocio lleva prueba. Todo bug arreglado lleva la prueba que lo reproduce |

**TypeScript:** `strict: true`, ESLint + Prettier, Zod en cada borde. NestJS: `controller` / `service` / `repository` (Prisma) / `dto` por módulo, sin lógica en el controller. React: componentes funcionales, TanStack Query para estado de servidor, sin estado global salvo la sesión. Tipos de API generados desde OpenAPI, nunca escritos a mano.

**Python:** 3.12, `ruff` + `mypy --strict`, Pydantic, una función pura por etapa del pipeline que guarda su salida en Parquet.

## Datos y privacidad

- Cada tabla con dueño lleva `club_id` y tiene seguridad por fila: un club nunca ve datos de otro.
- Ley 25.326: el jugador acepta términos y privacidad al crear la cuenta o escanear el QR. Borrar la cuenta borra perfil, estadísticas y clips propios en 30 días; el video completo se borra a los 30 días siempre.
- Sin reconocimiento facial. El jugador se identifica tocando "este soy yo" o por la reserva.
- No se graban turnos de menores sin permiso del adulto responsable cargado en la reserva; las escuelitas son "no grabar" por defecto.
- Videos privados, solo con links firmados de 1 hora. Soporte ve un video solo con permiso registrado en `audit_log`.
- Permisos por rol: sección 12 de la especificación.

## Comandos

```bash
pnpm install                 # dependencias de todo el monorepo
pnpm dev                     # api + web + base y redis en Docker Compose
pnpm -r lint && pnpm -r typecheck && pnpm -r test
pnpm contracts:generate      # regenera tipos desde packages/contracts
pnpm db:migrate && pnpm db:seed   # clubes de prueba de docs/pendientes.md
uv run --directory ml pytest
uv run --directory services/edge-agent pytest
```

## Antes de abrir un PR

- Lint, tipos y tests pasan en todo lo que tocaste.
- El PR dice qué issue cierra, qué cambió para el usuario y cómo se probó.
- No hay textos de usuario en el código, ni secretos, ni el nombre de la marca escrito a mano.
- Si agregaste una dependencia, su licencia es compatible (nada AGPL en lo que se distribuye: por eso no usamos Ultralytics).
