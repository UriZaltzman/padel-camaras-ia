# services/api

Dueño: `backend`.

API en NestJS. `prisma/schema.prisma` es del `arquitecto`. Ver `.claude/agents/backend.md`.

## Scripts

| Script                                                         | Qué hace                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm --filter @app/api dev`                                   | Compila en modo watch y levanta la API con el `.env` de la raíz |
| `pnpm --filter @app/api lint` / `typecheck` / `test` / `build` | Chequeos de CI                                                  |

Las variables de entorno se validan con Zod al arrancar (`src/config/env.ts`); si falta una obligatoria, la API no arranca. Los mensajes de error para el usuario están en `src/i18n/es-AR/errors.json`, uno por código del catálogo del contrato, con `{brand}` en lugar del nombre.

`ErrorCode` sale de los tipos generados de `@app/contracts`; el status HTTP de cada código está en `src/errors/error-codes.ts` y una prueba lo compara con `x-error-catalog`.

## Pruebas de contrato

`test/contract/` recorre las operaciones de `packages/contracts/openapi/openapi.yaml`, levanta la API en memoria y valida status, headers (`X-Request-Id`) y cuerpo de cada respuesta contra el contrato (Ajv en modo JSON Schema 2020-12; objetos cerrados: una propiedad no declarada es error). También falla si la API expone una ruta bajo `/v1` que no está en el contrato. Las excepciones temporales están en `test/contract/known-exceptions.ts`, cada una con su issue. Para agregar casos de una operación (con sesión, errores de negocio), sumalos en `test/contract/scenarios.ts`.
