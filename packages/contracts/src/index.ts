// Public entry of @app/contracts for TypeScript consumers (api, web, mobile).
// Every type comes from generated/typescript/schema.ts, produced by `pnpm contracts:generate`
// from openapi/openapi.yaml. Nothing here is written by hand except the thin client factory.
import createClient from 'openapi-fetch';
import type { Client, ClientOptions } from 'openapi-fetch';

import type { components, paths } from '../generated/typescript/schema';

export type * from '../generated/typescript/schema';

/** A schema of `components.schemas`, e.g. `Schema<'Error'>`. */
export type Schema<Name extends keyof components['schemas']> = components['schemas'][Name];

/** Typed HTTP client for `/v1`: paths, parameters, bodies and responses come from the contract. */
export type ApiClient = Client<paths>;

/** Create a typed client for the public API. `baseUrl` is the server root including `/v1`. */
export function createApiClient(options: ClientOptions): ApiClient {
  return createClient<paths>(options);
}
