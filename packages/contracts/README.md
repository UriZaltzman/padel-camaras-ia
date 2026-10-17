# packages/contracts

Dueño: `arquitecto`.

- `openapi/openapi.yaml`: contrato OpenAPI 3.1 de `/v1` (sección 11 de la especificación).
- `events/`: esquemas JSON de los eventos, con `event_id`, `occurred_at` y `schema_version`.
- `pnpm contracts:generate` genera los tipos de TypeScript y los modelos Pydantic. Los tipos nunca se escriben a mano.

Nadie programa contra la API hasta que el contrato esté publicado acá.

## Base común de `/v1`

Todo lo que comparten los módulos está en `components` de `openapi/openapi.yaml`:

| Pieza               | Dónde                                                                   | Regla                                                                                                             |
| ------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Error               | `schemas/Error`                                                         | Todo 4xx y 5xx devuelve `{code, message, details}`                                                                |
| Catálogo de códigos | `schemas/ErrorCode` (`enum` + `x-error-catalog`)                        | Cada código tiene estado HTTP, significado y forma de `details`. Solo se agregan; nunca se renombran ni se reusan |
| Respuestas de error | `responses/*`                                                           | Las operaciones referencian estas respuestas, nunca un error inline                                               |
| Paginación          | `parameters/Cursor`, `parameters/Limit`, `schemas/Page`                 | `?cursor=&limit=`, `limit` de 1 a 50 (20 por defecto), `next_cursor` es `null` en la última página                |
| Límite de pedidos   | `info.x-rate-limit`, `headers/RateLimit-*`, `responses/TooManyRequests` | 60 por minuto por usuario; toda operación documenta el `429`                                                      |
| Tipos base          | `schemas/Uuid`, `schemas/Timestamp`, `schemas/AmountCents`              | UUID v7, fechas UTC, plata en centavos                                                                            |

## Lint

```bash
pnpm --filter @app/contracts lint
```

Corre Spectral (`spectral:oas` más las reglas propias de `.spectral.yaml`) y falla con cualquier error o advertencia. Las reglas propias verifican que el catálogo de errores y el `enum` coincidan, la forma del error, que los errores usen `components/responses`, que cada operación documente el `429`, que `limit` no pase de 50 y que las propiedades estén en `snake_case`.
