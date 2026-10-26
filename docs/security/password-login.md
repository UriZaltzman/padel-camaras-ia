# Ingreso con contraseña (dueños, personal del club y personal interno)

Cierra el issue #343. Texto técnico en español rioplatense con los nombres de código en inglés, como el resto de `docs/`. Los jugadores siguen entrando con el código de WhatsApp; esto es para quienes tienen email y contraseña.

## 1. Qué hay

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| Hash | `services/api/src/auth/credentials/password-hasher.ts` | Argon2id (`@node-rs/argon2`, MIT), `m=19456` KiB (19 MiB), `t=2`, `p=1`, sal aleatoria única de 16 bytes. Se guarda el string PHC (`$argon2id$v=19$m=...,t=...,p=...$sal$hash`): algoritmo y parámetros viajan con el hash |
| Pepper | Variable `AUTH_PASSWORD_PEPPERS` (gestor de secretos, nunca la base) | Antes de Argon2 la contraseña pasa por HMAC-SHA256 con el pepper: con una base robada sola no se puede atacar sin conexión. Como la entrada de Argon2 tiene tamaño fijo, la contraseña puede ser de cualquier largo y cualquier Unicode (se normaliza NFKC) |
| Rotación | `AUTH_PASSWORD_PEPPERS` (`{"1":"…","2":"…"}`) + `AUTH_PASSWORD_PEPPER_VERSION` | Cada fila guarda `pepper_version`. Se agrega una versión nueva y se sube la actual: las contraseñas viejas siguen entrando y se vuelven a hashear solas en el próximo ingreso (`needsRehash`). Lo mismo si suben los parámetros de `ARGON2_PARAMS` |
| Política | `password-policy.ts`, `common-passwords.ts` | 10 caracteres o más (caracteres, no bytes), máximo 1024 solo para acotar el cuerpo, sin reglas de composición. Rechaza las contraseñas más comunes (lista incluida), secuencias, repeticiones y las que contienen la parte local del email. `TODO_CLUB`: sumar una consulta k-anonymity a un servicio de contraseñas filtradas |
| Bloqueo | `login-throttle.ts` | 5 fallos en 15 minutos por email escrito (exista o no) bloquea 15 minutos; 30 fallos por IP, igual. Bloqueado responde `429 RATE_LIMITED` con `Retry-After`, incluso con la contraseña correcta |
| Sin enumerar cuentas | `credentials.service.ts` | Mismo error (`INVALID_CREDENTIALS`), mismos contadores, mismo trabajo (Argon2 contra un hash señuelo si la cuenta no existe) y comparación en tiempo constante. `forgot` responde siempre `202` y manda el email en segundo plano |
| Recuperación | `password/forgot`, `password/reset` | Token de 256 bits, se guarda solo su SHA-256, vence a los 30 minutos, un solo uso (un `UPDATE … WHERE used_at IS NULL` decide quién gana si hay dos pedidos), pedir otro reemplaza el anterior. Al terminar se cortan todas las sesiones de la cuenta |
| Sesiones | `session.service.ts` | Cada usuario tiene una "época" de sesión; el access token y el refresh token la llevan. Subirla (reset o cambio de contraseña) invalida todos al instante |
| Segundo factor | `totp.ts`, `staff.guard.ts` | TOTP (RFC 6238, SHA-1, 6 dígitos, 30 s, ±1 paso) **obligatorio para el personal interno** (`INTERNAL_STAFF`). Sin código no hay sesión; la sesión lleva `mfa: true` y `StaffGuard` rechaza cualquier otra, aunque venga de WhatsApp o de una contraseña sola. El código de un paso ya usado no vale otra vez. El secreto se guarda cifrado (AES-256-GCM, clave de `AUTH_TOTP_ENCRYPTION_KEY`) |
| Códigos de WhatsApp | `otp/otp.service.ts` | Ya estaban hasheados con HMAC-SHA256 (`AUTH_OTP_SECRET`), vencen a los 5 minutos, 5 intentos, un solo uso. Sin cambios; ahora hay un test que lo verifica de punta a punta |
| Auditoría | `auth-audit.service.ts` → `audit_log` | `auth.login_succeeded`, `auth.login_failed` (también contra emails que no existen, sin usuario ni email), `auth.login_locked`, `auth.second_factor_failed`, `auth.second_factor_enrolled`, `auth.password_reset_requested`, `auth.password_reset_completed`, `auth.password_changed`, `auth.password_rehashed`. Solo ids y un motivo, nunca contraseñas, códigos, tokens ni emails |
| Logs | `logging/logger.ts` | Se censuran `password`, `current_password`, `new_password`, `totp_code`, `secret`, `otpauth_uri`, `token`, `reset_token`, `otp`, `authorization`, `cookie`, `email`, `phone`. Los errores de validación nunca incluyen el valor recibido |

## 2. Rutas

`POST /v1/auth/login`, `/auth/2fa/enroll`, `/auth/2fa/confirm`, `/auth/password/forgot`, `/auth/password/reset`, `/auth/password/change`. Contrato en `packages/contracts/openapi/openapi.yaml`.

Alta del segundo factor del personal interno: el primer ingreso responde `401 SECOND_FACTOR_REQUIRED` con `details.enrollment_required: true`; `enroll` (prueba la contraseña) devuelve el secreto y el `otpauth://`; `confirm` con el primer código lo activa y abre sesión. Una vez confirmado no se puede volver a enrolar (si no, quien robe la contraseña cambiaría el autenticador). Cambiar de teléfono es un trámite de soporte con otro administrador (`TODO_CLUB`: definir y construir el reinicio del segundo factor y los códigos de recuperación).

## 3. Datos y RLS

* `user_credentials` (una fila por usuario) y `password_reset_tokens` son tablas de personas, sin `club_id`: están en la lista de excepciones de `rls-guard.test.ts` con el motivo. Políticas: `user_credentials` solo la fila propia o el API como `system`; `password_reset_tokens` solo `system`. Ni siquiera soporte lee un hash (matriz en `rls-matrix.md`).
* El login corre como `system` antes de saber quién es el usuario, como el ingreso por WhatsApp.
* El email vive en `users.email` y en `auth_identities` (`provider = 'email'`, normalizado en minúsculas, NFKC).

## 4. Cookies y CSRF en la web

El API devuelve los tokens en JSON y no fija cookies. La web (`apps/web`) debe seguir el patrón que ya usa para jugadores (`src/lib/player/session.ts`):

* Los tokens viven en una cookie `HttpOnly; Secure` (en producción), `SameSite=Lax` (o `Strict` para el panel del club y la consola interna), `Path=/`, escrita **solo desde el servidor** (server actions). Nunca en `localStorage` ni visibles para JavaScript del navegador.
* El navegador nunca habla directo con el API: lo hace el servidor de Next con el token de la cookie.
* CSRF: las server actions solo aceptan POST del mismo origen (Next compara `Origin` con `Host`). Para las rutas `route.ts` que escriban, repetir esa comprobación de `Origin` y no usar `GET` para nada que cambie estado.
* La sesión de la consola interna no debería durar más que el access token de 15 minutos sin refrescar, y el refresh se hace del lado del servidor.
* Al cerrar sesión o cambiar la contraseña: borrar la cookie. Cambiar la contraseña devuelve un par de tokens nuevo que hay que guardar.

## 5. Variables de entorno

| Variable | Obligatoria en producción | Qué es |
| --- | --- | --- |
| `AUTH_PASSWORD_PEPPERS` | sí | JSON `{"<versión>":"<secreto de 32+ caracteres>"}` |
| `AUTH_PASSWORD_PEPPER_VERSION` | no | Versión para hashes nuevos; por defecto la más alta |
| `AUTH_TOTP_ENCRYPTION_KEY` | sí | Clave (32+ caracteres) que cifra los secretos TOTP |
| `PASSWORD_RESET_URL` | no | Página de la web que recibe `?token=` |
| `HTTP_TRUST_PROXY_HOPS` | si hay proxy | Cuántos proxies hay delante; sin esto el bloqueo por IP ve la IP del proxy |

Se generan con el gestor de secretos, nunca en el repo. En desarrollo hay valores por defecto que **no sirven en producción**.

## 6. Semilla de desarrollo

`seedCredentials(prisma, logins)` (`services/api/src/auth/credentials/seed-credentials.ts`) crea el usuario, la identidad de email y la credencial de cada cuenta, hasheando la contraseña en ese momento con los mismos parámetros y pepper que el API (`AUTH_PASSWORD_PEPPERS` o el de desarrollo). Se niega a correr con `NODE_ENV=production` y rechaza contraseñas que rompan la política. Se usa desde el script de seed con el cliente de migraciones:

```ts
await seedCredentials(prisma, [
  { userId: '…', name: 'Dueño demo', email: 'dueno@demo.test', password: process.env.SEED_OWNER_PASSWORD! },
]);
```

Las contraseñas de la semilla no se escriben en el repo ni se imprimen: salen de variables de entorno o se generan al sembrar. El personal interno de la semilla además necesita estar en `INTERNAL_STAFF` y enrolar su autenticador en el primer ingreso.

## 7. Qué queda abierto

1. **Envío del email de recuperación.** Hoy no hay proveedor de email: en producción `UnconfiguredPasswordResetSender` falla (el pedido igual responde `202`, queda un error en el log sin datos). `TODO_COTIZAR`: elegir proveedor, y que una persona cree la cuenta. En desarrollo el enlace se imprime en el log (solo fuera de producción), igual que el código de WhatsApp.
2. **Bloquear la cuenta de otro.** El bloqueo por cuenta permite que alguien con el email de un dueño lo deje afuera 15 minutos repitiendo fallos. Es el costo de no revelar si el email existe. Se limita por duración, no se acumula, y el dueño puede recuperar la contraseña (eso limpia el bloqueo).
3. **Reinicio del segundo factor** y códigos de recuperación (ver §2).
4. **Lista de contraseñas filtradas** más grande (ver §1).
5. **Dueños y personal del club** no tienen segundo factor obligatorio (la issue lo exige solo al personal interno); se puede extender con el mismo mecanismo.
