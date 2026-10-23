# Aislamiento entre clubes: matriz RLS, modelo de amenazas y pendientes

Cierra el issue #112 (auditoría de punta a punta). Texto técnico en español rioplatense con los nombres de código en inglés, como el resto de `docs/`. Manda `docs/especificacion-tecnica.md` §12; esto es el detalle verificable.

**Regla:** un usuario, staff o entrenador del club A nunca lee ni escribe nada del club B, y un jugador solo ve lo suyo. Si una capa falla, la base lo impide.

## 1. Cómo funciona

| Pieza | Qué hace |
| --- | --- |
| `PrismaService.run(ctx, fn)` | Única puerta a la base. Abre una transacción, hace `SET LOCAL ROLE app_runtime` y fija `app.role`, `app.user_id`, `app.club_id` con `set_config(..., true)` (= `SET LOCAL`). Al terminar la transacción el contexto desaparece: no se filtra entre requests aunque la conexión se reuse (probado con 60 requests concurrentes y pool compartido). |
| Rol `app_runtime` | `NOLOGIN NOSUPERUSER NOBYPASSRLS`, dueño de nada, sin `TRUNCATE/REFERENCES/TRIGGER`, sin acceso a `_prisma_migrations`, `audit_log` solo `INSERT`/`SELECT`. |
| Sin contexto | `app.role` vacío o desconocido => ninguna política da `true` => 0 filas y escrituras rechazadas (falla cerrado). `assertValidContext` rechaza roles inválidos antes de llegar a la base. |
| Roles de base | `player`, `coach`, `staff`, `owner`, `support`, `club_device`, `system`. Los fija el API según las membresías (`ClubAccessService`) o el certificado del equipo; el token solo identifica al usuario, nunca trae club ni rol (no se puede reusar un token en otro club). |
| `FORCE ROW LEVEL SECURITY` | En las 40 tablas: ni el dueño de la tabla se saltea las políticas. |
| Triggers `*_immutable_keys` | `club_id` (y la clave del padre: `match_id`, `booking_id`, `lesson_id`, `user_id` según la tabla) no cambian nunca con un `UPDATE`. |
| Trigger `*_support_audit` | Toda escritura de `support` en una tabla de club deja una fila en `audit_log` (solo ids, nunca el contenido). |
| Helpers `app_*()` | `SECURITY DEFINER` con `search_path` fijo, sin `EXECUTE` para `PUBLIC`, solo responden por el usuario de la sesión. |

### Dos roles de base, no uno (migraciones vs. aplicación)

* **Rol de migraciones** (dueño de las tablas y de las funciones `SECURITY DEFINER`): superusuario o `BYPASSRLS`. Hace falta porque con `FORCE` las funciones helper leen tablas sin pasar por las políticas; si el dueño no saltea RLS, las políticas se llaman a sí mismas. El test `rls-guard` falla si una función `SECURITY DEFINER` tiene un dueño que no saltea RLS.
* **Rol de la aplicación** (el que abre la conexión del pool, el de `DATABASE_URL`): `LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT`, miembro de `app_runtime`, sin ser dueño de nada. Aunque algún día una consulta olvide pasar por `run`, no puede leer ni escribir (no es dueño, no tiene `BYPASSRLS`). En local el `docker-compose` usa un superusuario por comodidad: ahí la barrera es el `SET LOCAL ROLE app_runtime` de `run` (probado en `rls-matrix.test.ts`: `current_user = app_runtime` en cada request). `TODO_CLUB`: crear el rol de aplicación en la infra de producción (`infra/`, dueño club-devops) antes del primer despliegue.

## 2. Agujeros encontrados y corregidos

Migración `20261024120000_rls_hardening`, contrato y tests de este PR.

| # | Agujero | Corrección |
| --- | --- | --- |
| H1 | Ninguna tabla tenía `FORCE`: el dueño de la tabla (migraciones, o una conexión que no hiciera `SET ROLE`) leía y escribía todos los clubes | `FORCE ROW LEVEL SECURITY` en todas las tablas; el test de guarda lo exige |
| H2 | Las políticas de `UPDATE` de jugador/coach/system solo fijaban el dueño de la fila, no el club ni el padre: un jugador podía hacer `UPDATE bookings SET club_id = <otro club>` o apuntar su `match_players` a un partido de otro club y leerlo | Trigger `forbid_key_change` en las 36 tablas con `club_id` (+ claves de padre) |
| H3 | Las funciones helper eran ejecutables por `PUBLIC` | `REVOKE EXECUTE ... FROM PUBLIC`, y también por defecto para funciones futuras |
| H4 | `app_runtime` podía leer y escribir `_prisma_migrations` | `REVOKE ALL` |
| H5 | Las escrituras de soporte interno en cualquier club no dejaban rastro salvo que el API se acordara | Trigger de auditoría `*_support_audit` |
| H6 | Soporte podía otorgarse a sí mismo acceso a un video (la autorización es una fila de `audit_log` que cualquier rol podía insertar) | Solo el rol `system` (el API, tras el permiso del club/jugador) puede insertar `video.access_granted` |
| H7 | El evento `payment.refunded` no llevaba `club_id`: un consumidor no podía fijar su contexto de club | `club_id` obligatorio en el contrato (los otros 11 ya lo tenían); helper `systemContextFor(event)` para los consumidores y test que exige `club_id` en todo evento nuevo |
| H8 | Sin pruebas: sin matriz, sin guarda en CI, sin pruebas de adivinar IDs (issue #112) | `services/api/test/security/*` (ver §5) |

Revisado y sin cambios necesarios: las 40 tablas tienen RLS y al menos una política que aplica a `SELECT`; ninguna política apunta a `PUBLIC`; no hay vistas; las cuatro tablas sin `club_id` (`users`, `auth_identities`, `clubs`, `ratings`) están justificadas en la guarda; tokens de sesión sin club; claves de Redis por usuario/token/evento; la caché de disponibilidad (en proceso) es por `court_id`, que pertenece a un solo club.

## 3. Matriz tabla x rol x operación (club propio)

Generada por `services/api/test/security/rls-matrix.test.ts` contra un Postgres real. Se comprueba en CI: si cambia una política, el test falla hasta regenerar con `UPDATE_RLS_MATRIX=1 pnpm --filter @app/api exec vitest run test/security/rls-matrix` y revisar el diff a mano. **Sobre filas de otro club, todas las celdas son `····`** (lo afirma el mismo test para cada rol y cada tabla: `SELECT`, `INSERT` con `club_id` ajeno, `UPDATE` y `DELETE`), con tres excepciones deliberadas y listadas en §6: `support` (técnico, de cualquier club), el directorio público de clubes para `player` (`clubs`, `courts`, reglas de turnos, `club_modules`) y `system` sobre las tablas de personas.

<!-- matrix:start (generated by services/api/test/security/rls-matrix.test.ts) -->
Cell = operations the role can do on the rows of its own club: **S**elect, **I**nsert, **U**pdate, **D**elete (`·` = refused). `player` and `coach` are tested against rows that belong to them (their own booking, match, lesson...). Every cell on club B rows is `····` (asserted above).

| table | player | coach | staff | owner | support | club_device | system |
| --- | --- | --- | --- | --- | --- | --- | --- |
| audit_log | `····` | `····` | `····` | `SI··` | `S···` | `····` | `SI··` |
| auth_identities | `SIUD` | `····` | `····` | `····` | `····` | `····` | `SIUD` |
| booking_players | `SIUD` | `····` | `SIUD` | `SIUD` | `····` | `S···` | `SIUD` |
| booking_rule_price_bands | `S···` | `····` | `S···` | `SIUD` | `S···` | `S···` | `SIUD` |
| booking_slots_rules | `S···` | `····` | `S···` | `SIUD` | `S···` | `S···` | `SIUD` |
| bookings | `SIU·` | `····` | `SIUD` | `SIUD` | `····` | `S···` | `SIUD` |
| calibrations | `····` | `····` | `S···` | `S···` | `SIUD` | `S···` | `SIUD` |
| cameras | `····` | `····` | `S···` | `S···` | `SIUD` | `SIUD` | `SIUD` |
| clips | `SIUD` | `S···` | `SIUD` | `SIUD` | `····` | `SIUD` | `SIUD` |
| club_modules | `S···` | `S···` | `S···` | `S···` | `S·UD` | `S···` | `S···` |
| club_player_notes | `····` | `····` | `SIUD` | `SIUD` | `····` | `····` | `SIUD` |
| clubs | `S···` | `S···` | `S···` | `S·U·` | `SIU·` | `S···` | `SIU·` |
| coach_access_grants | `SIUD` | `S···` | `····` | `····` | `····` | `····` | `S···` |
| contracts | `····` | `····` | `····` | `S···` | `SIUD` | `····` | `S···` |
| court_blocks | `····` | `····` | `SIUD` | `SIUD` | `····` | `····` | `SIUD` |
| courts | `S···` | `S···` | `S···` | `SIUD` | `SIUD` | `S···` | `SIUD` |
| devices | `····` | `····` | `S···` | `S···` | `SIUD` | `SIUD` | `SIUD` |
| insights | `S···` | `····` | `····` | `····` | `····` | `····` | `SIUD` |
| lesson_notes | `····` | `S···` | `S···` | `SIUD` | `····` | `S···` | `SIUD` |
| lesson_requests | `S···` | `S···` | `S···` | `SIUD` | `····` | `S···` | `SIUD` |
| lesson_students | `S·U·` | `S···` | `S···` | `SIUD` | `····` | `S···` | `SIUD` |
| lessons | `····` | `S·U·` | `S···` | `SIUD` | `····` | `S···` | `SIUD` |
| match_players | `S·U·` | `S···` | `SIUD` | `SIUD` | `SIUD` | `SIUD` | `SIUD` |
| match_stats | `S···` | `····` | `····` | `····` | `····` | `····` | `SIUD` |
| matches | `S···` | `S···` | `SIUD` | `SIUD` | `SIUD` | `SIUD` | `SIUD` |
| media_assets | `S···` | `S···` | `S···` | `SIUD` | `····` | `SIUD` | `SIUD` |
| memberships | `S···` | `····` | `S···` | `SIUD` | `S···` | `····` | `SIUD` |
| notifications | `S·U·` | `····` | `····` | `····` | `····` | `····` | `·I··` |
| payments | `S···` | `····` | `····` | `S···` | `····` | `····` | `SIUD` |
| points | `S···` | `S···` | `SIUD` | `SIUD` | `SIUD` | `SIUD` | `SIUD` |
| processing_jobs | `····` | `····` | `S···` | `S···` | `SIUD` | `S···` | `SIUD` |
| ratings | `S···` | `····` | `····` | `····` | `····` | `····` | `SIUD` |
| settlements | `····` | `····` | `····` | `S···` | `····` | `····` | `SIUD` |
| shots | `S···` | `S···` | `SIUD` | `SIUD` | `SIUD` | `SIUD` | `SIUD` |
| tournament_groups | `····` | `····` | `SIUD` | `SIUD` | `····` | `····` | `SIUD` |
| tournament_matches | `····` | `····` | `SIUD` | `SIUD` | `····` | `····` | `SIUD` |
| tournament_points | `····` | `····` | `SIUD` | `SIUD` | `····` | `····` | `SIUD` |
| tournament_registrations | `····` | `····` | `SIUD` | `SIUD` | `····` | `····` | `SIUD` |
| tournaments | `····` | `····` | `SIUD` | `SIUD` | `····` | `····` | `SIUD` |
| users | `S·UD` | `S·UD` | `S·UD` | `S·UD` | `S···` | `····` | `SIUD` |
<!-- matrix:end -->

Lectura rápida: el jugador solo toca lo propio (reserva, sus slots, sus clips, sus notificaciones); el staff opera el club pero no ve estadísticas personales, pagos ni liquidaciones; el dueño suma plata y configuración de su club; el coach ve solo los partidos y clases que dicta; el equipo del club (`club_device`) sube partidos y medios de su club; soporte ve datos técnicos de cualquier club y videos solo con permiso vigente; `system` es el API actuando por un club (webhooks, workers).

## 4. Más allá de SQL

| Capa | Estado | Cómo se asegura |
| --- | --- | --- |
| Caché de disponibilidad | Mapa en proceso por `court_id` (UUID global), solo contiene libre/ocupado, sin personas | Una cancha pertenece a un solo club: sin colisión posible. Si se mueve a Redis la clave debe llevar `court_id` (ya único) |
| Claves de Redis | `rt:{tokenId}`, `rt-revoked:{familyId}`, `otp:{phone}`, `idem:booking:{userId}:{key}`, `payments:checkout:{userId}:{key}`, `events:processed:{consumer}:{eventId}` | Todas por usuario/token/evento; `layers.test.ts` falla si aparece una clave que no nombra de quién es |
| WebSocket por cancha | **No existe todavía** (solo el contrato `realtime/court-channel`) | `layers.test.ts` falla si aparece un gateway. Requisitos al construirlo: autenticar con el token en el primer frame, unir a un jugador solo si tiene reserva/partido en esa cancha ahora (o staff del club de la cancha), equipo del club por mTLS con `DEVICE_CLUB_MISMATCH`, salas `court:{id}`, re-chequear al revocar |
| URLs firmadas y rutas de objetos | **No existen todavía** | `layers.test.ts` falla si aparece una librería de URLs firmadas o de storage. Requisitos: firmar solo una fila leída con el contexto del que pide, vencimiento <= 1 hora, clave de objeto `clubs/{club_id}/...` |
| BullMQ y eventos | Un solo bus (`events/event-bus.ts`), eventos validados contra el contrato | Los 12 eventos llevan `club_id` obligatorio (test); el consumidor usa `systemContextFor(event)` (rol `system` fijado al club del evento, rechaza eventos sin club) |
| Logs | JSON con `request_id`, `club_id`, `match_id`; nunca datos personales ni tokens | Sin cambios; los errores devuelven `NOT_FOUND` (no `FORBIDDEN`) para recursos de otro club, así no se revela qué existe |
| Acceso interno | Consola `/admin` solo con `StaffGuard` (directorio de staff interno, falla cerrado); las escrituras de soporte quedan auditadas por trigger; el video requiere un `video.access_granted` de menos de 1 hora, insertable solo por el API | Probado: dueño de un club recibe 403 en `/admin` |
| Tokens entre clubes | El access token identifica al usuario; el rol y el club salen de las membresías en cada request | `ClubAccessService.authorize`; probado con IDs de A usados por usuarios de B |

## 5. Pruebas (todas corren en CI contra Postgres real)

| Archivo | Qué prueba |
| --- | --- |
| `test/security/rls-guard.test.ts` | **Guarda de CI.** Falla si una tabla nueva no tiene RLS `ENABLE` + `FORCE`, ninguna política (o ninguna que aplique a `SELECT`), no tiene `club_id` y no está en la lista de excepciones, no tiene el trigger de claves inmutables ni la auditoría de soporte; si una política apunta a `PUBLIC` o es una tautología; si `app_runtime` es superusuario/`BYPASSRLS`/dueño de algo; si una función `SECURITY DEFINER` no fija `search_path`, es ejecutable por `PUBLIC` o su dueño no saltea RLS; si hay una vista sin `security_invoker` |
| `test/security/rls-matrix.test.ts` | Para **cada tabla del catálogo** (se siembran sola, sin lista a mano) y cada uno de los 7 roles de A: `SELECT`, `INSERT`, `UPDATE`, `DELETE` sobre filas de B = 0; sin contexto = vacío; extraño = nada. Ataques puntuales: mover filas a otro club, unirse a un partido ajeno, JOINs/CTEs/subconsultas cruzadas, contexto en conexiones reusadas en paralelo, escalar el rol, auditoría de soporte, autoconcederse video. Genera la matriz de §3 |
| `test/security/api-isolation.integration.test.ts` | Adivinar IDs: usuarios de B (dueño, staff, coach, jugador) llaman cada ruta REST con IDs de recursos de A, por el club de A y por el club de B con el ID de A; no devuelven nada, no cambian nada; sin token todo da 401; **falla si aparece una ruta nueva que no está cubierta** |
| `test/security/layers.test.ts` | Puertas nuevas (WebSocket, URLs firmadas, otras colas, otro cliente Prisma), claves de Redis, `club_id` en eventos |
| `test/db/*` (existentes) | Cierra los casos de #112 con los tres clubes de prueba |

## 6. Qué queda abierto

1. **Contexto de sesión confiable.** Quien consiga ejecutar SQL arbitrario dentro de una transacción del API (inyección) puede hacer `set_config('app.role', 'support', true)`. Hoy la barrera es no tener SQL crudo con datos de usuario (todo es Prisma o `Prisma.sql` parametrizado; `layers.test.ts` limita dónde se usa SQL crudo). Mitigación futura: contexto firmado (HMAC verificado por una función) o un rol de base distinto por rol de aplicación.
2. **`system` es poderoso a propósito.** Lee y escribe `users`, `auth_identities` y `ratings` de todos (iniciar sesión, calificar) y trabaja por club en el resto. Un bug que use `system` sin pasar por una autorización del servicio salta el aislamiento. Todo código que lo use debe validar primero (revisión de PR de QA).
3. **Soporte** lee datos técnicos de cualquier club (dispositivos, partidos, jugadores en `match_players`, membresías) y escribe en tablas técnicas; las escrituras quedan auditadas, las lecturas no (salvo video). Pendiente producto: alarma si un usuario de soporte lee muchos clubes, y que el permiso de video lo apruebe el club (hoy el API lo inserta).
4. **Columnas.** RLS filtra filas, no columnas: un jugador puede leer `cuit` y `mercadopago_collector_id` de cualquier club si ejecuta SQL (la API no los devuelve; la prueba de la API lo verifica). Si hace falta más, mover esos campos a una tabla de facturación solo para el dueño.
5. **Integridad dentro del club.** Un jugador puede insertar su propia reserva con el precio o el estado que quiera si llega a hablar con la base; el API calcula precio y estado. Defensa futura: columnas calculadas o `CHECK` por rol.
6. **Roles de producción.** Hace falta crear el rol de aplicación `LOGIN NOBYPASSRLS` y que el rol de migraciones tenga `BYPASSRLS` (§1). Aún no hay infraestructura de producción: queda como requisito de `infra/`.
7. **Tripwires sin implementación.** WebSocket por cancha y URLs firmadas no existen aún; sus requisitos están en §4 y los tests los hacen cumplir cuando aparezcan. Cuando se construyan hay que reemplazar el tripwire por pruebas reales (reglas de `court-channel` y vencimiento de 1 hora).
8. **Pruebas de carga de aislamiento** (`tests/load`) y de las apps móviles: fuera de este alcance.

## 7. Cómo agregar una tabla (lista para no olvidarse)

1. Columna `club_id uuid NOT NULL` (salvo que sea una tabla de personas: entonces va a la lista de excepciones de `rls-guard.test.ts` con el motivo).
2. En la migración: `ENABLE` y `FORCE ROW LEVEL SECURITY`, `GRANT ... TO app_runtime`, al menos una política por operación que usa los helpers `app_*()`, el trigger `forbid_key_change` (con las claves de padre que lleve) y el trigger `audit_support_write`. Copiar el bloque `DO $$` del final de `20261024120000_rls_hardening`.
3. `pnpm --filter @app/api exec vitest run test/security` en verde; regenerar la matriz (`UPDATE_RLS_MATRIX=1`) y revisar el diff.
4. Si agregás una ruta REST, sumala a `attacks` en `api-isolation.integration.test.ts`.
