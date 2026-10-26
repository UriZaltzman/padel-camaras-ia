# Entorno de punta a punta (full-stack e2e)

Levanta la API real con Postgres y Redis, con los tres clubes de prueba cargados, y corre Playwright contra ella con la web en modo "API real" (sin `NEXT_PUBLIC_API_MOCK`).

```bash
pnpm e2e:full        # sube todo, espera el health check, corre Playwright y baja todo (borra los volúmenes)
E2E_KEEP=1 pnpm e2e:full   # deja el stack arriba para mirar
E2E_NO_BUILD=1 pnpm e2e:full   # reusa la imagen de la API
```

Hace falta Docker. En CI corre a pedido: workflow `e2e-full` (botón "Run workflow" o la etiqueta `e2e-full` en el PR).

## Qué hay

| Pieza                              | Dónde                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------ |
| Postgres 17, Redis 7 y la API real | `infra/e2e/docker-compose.yml` (puertos 55432, 56379 y 3300)             |
| Imagen de la API                   | `infra/e2e/api.Dockerfile` (migra, carga el seed y arranca)              |
| Seed de los 3 clubes               | `services/api/src/seed` (`pnpm --filter @app/api db:seed`)               |
| Playwright contra la API real      | `apps/web/playwright.full.config.ts` y `apps/web/e2e-full/`              |
| Pagos                              | `PAYMENT_PROVIDER=fake`: aprueba toda preferencia; el webhook va firmado |
| Códigos de WhatsApp                | en desarrollo la API los imprime en su log; las pruebas los leen de ahí  |

## Seed

`Club Demo Palermo` (4 canchas, seña fija), `Club Demo Quilmes` (2 canchas, plan compra) y `Club Demo Pilar` (6 canchas, canchas con y sin seña). Cada uno tiene dueño, staff, 2 entrenadores, 24 jugadores de 8va a 3ra, 60/90/120 minutos cada 30, precios por franja, 30 partidos publicados y turnos futuros con duraciones mezcladas. Palermo suma un torneo con parejas inscriptas.

- Determinista: ids fijos (`seedId`) y fechas relativas a hoy (`SEED_TODAY=AAAA-MM-DD` las fija).
- Idempotente: correrlo dos veces no cambia nada (`skipDuplicates`). No actualiza filas ya cargadas: para cambiar datos, base nueva.
- Nunca contra producción: se niega si `NODE_ENV=production` o si la base no es local (`SEED_ALLOW_REMOTE=1` permite una base compartida de desarrollo).
- Teléfonos `+549115550<club><n>` y mails `@example.com`: ficticios. Staff de Palermo: `+5491155501002`; dueño: `+5491155501001`; jugadores desde `+5491155501011`.
- `seedCredentials()` (`services/api/src/seed/credentials.ts`) es el gancho para las contraseñas de desarrollo cuando llegue el login con contraseña (#343). Hoy devuelve una lista vacía: se entra con código de WhatsApp.

## Límites conocidos

- El panel del club (web) todavía no tiene login, así que la prueba mira el calendario del club por la API (`GET /club-admin/bookings`) con la sesión del staff y no por la pantalla.
