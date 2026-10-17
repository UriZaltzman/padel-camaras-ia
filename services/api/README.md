# services/api

Dueño: `backend`.

API en NestJS. `prisma/schema.prisma` es del `arquitecto`. Ver `.claude/agents/backend.md`.

## Scripts

| Script                                                         | Qué hace                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm --filter @app/api dev`                                   | Compila en modo watch y levanta la API con el `.env` de la raíz |
| `pnpm --filter @app/api lint` / `typecheck` / `test` / `build` | Chequeos de CI                                                  |

Las variables de entorno se validan con Zod al arrancar (`src/config/env.ts`); si falta una obligatoria, la API no arranca. Los mensajes de error para el usuario están en `src/i18n/es-AR/errors.json`, uno por código del catálogo del contrato, con `{brand}` en lugar del nombre.

`scripts/generate-error-codes.mjs` lee el catálogo `ErrorCode` de `packages/contracts/openapi/openapi.yaml` y escribe `src/generated/error-codes.ts` (ignorado por git). Es provisorio hasta #32.
