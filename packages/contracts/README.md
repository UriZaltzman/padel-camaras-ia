# packages/contracts

Dueño: `arquitecto`.

- `openapi/`: contrato OpenAPI 3.1 de `/v1` (sección 11 de la especificación).
- `events/`: esquemas JSON de los eventos, con `event_id`, `occurred_at` y `schema_version`.
- `pnpm contracts:generate` genera los tipos de TypeScript y los modelos Pydantic. Los tipos nunca se escriben a mano.

Nadie programa contra la API hasta que el contrato esté publicado acá.
