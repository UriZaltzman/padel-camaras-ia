# packages/contracts

Dueño: `arquitecto`.

- `openapi/openapi.yaml`: contrato OpenAPI 3.1 de `/v1` (sección 11 de la especificación).
- `examples/match-results.example.json`: partido completo (6-0 6-0, punto de oro) en el formato de resultados del pipeline (`MatchResults`, `POST /device/matches/{id}/results`). Lo produce `ml` y lo manda `services/edge-agent`; `test/match-results.test.mjs` lo valida contra el esquema y contra el reglamento.
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

## Tipos generados

```bash
pnpm contracts:generate   # necesita Node 22 y uv
```

| Salida                                     | Generador                                  | Licencia | Quién lo usa     |
| ------------------------------------------ | ------------------------------------------ | -------- | ---------------- |
| `generated/typescript/schema.ts`           | `openapi-typescript` 7.13.0                | MIT      | api, web, mobile |
| `src/index.ts` (cliente `createApiClient`) | `openapi-fetch` 0.17.0 sobre esos tipos    | MIT      | api, web, mobile |
| `generated/python/app_contracts/models.py` | `datamodel-code-generator` 0.85.0 (fijado) | MIT      | edge-agent, ml   |

- **TypeScript:** `import type { Schema } from '@app/contracts'` y `Schema<'Error'>`, o `createApiClient({ baseUrl })` para un cliente tipado de `/v1`.
- **Python:** el paquete `app-contracts` es miembro del workspace de uv. Se agrega con `app-contracts = { workspace = true }` en `[tool.uv.sources]` y se usa con `from app_contracts.models import Error`.
- **Lo generado se commitea.** Nunca se edita a mano: se cambia el contrato y se regenera. CI regenera y falla si `git status` muestra diferencias en `generated/`.
- `pnpm --filter @app/contracts test` comprueba que el TypeScript generado coincide con el commiteado y que un cambio incompatible del contrato rompe la compilación de un consumidor de prueba (`test/fixtures/consumer.ts`).
- Las versiones del generador de Python están fijadas con hashes en `python/requirements-codegen.txt`; subir una versión implica regenerar y commitear.
