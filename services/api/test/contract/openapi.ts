// Reads the OpenAPI contract and walks its operations. Everything the contract tests check comes
// from here, so new endpoints in packages/contracts are picked up without touching the tests.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from 'yaml';

export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type JsonSchema = Record<string, unknown>;

export interface Reference {
  $ref: string;
}

export interface HeaderObject {
  required?: boolean;
  schema?: JsonSchema;
}

export interface MediaTypeObject {
  schema?: JsonSchema;
  example?: unknown;
  examples?: Record<string, { value?: unknown } | Reference>;
}

export interface ResponseObject {
  description?: string;
  headers?: Record<string, HeaderObject | Reference>;
  content?: Record<string, MediaTypeObject>;
}

export interface ParameterObject {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  schema?: JsonSchema;
  example?: unknown;
  examples?: Record<string, { value?: unknown } | Reference>;
}

export interface RequestBodyObject {
  required?: boolean;
  content?: Record<string, MediaTypeObject>;
}

export type SecurityRequirement = Record<string, string[]>;

export interface OperationObject {
  operationId?: string;
  parameters?: (ParameterObject | Reference)[];
  requestBody?: RequestBodyObject | Reference;
  responses?: Record<string, ResponseObject | Reference>;
  security?: SecurityRequirement[];
}

export type PathItemObject = Partial<Record<HttpMethod, OperationObject>> & {
  parameters?: (ParameterObject | Reference)[];
};

export interface OpenApiDocument {
  openapi: string;
  servers?: { url: string }[];
  security?: SecurityRequirement[];
  paths?: Record<string, PathItemObject>;
  components?: Record<string, Record<string, unknown> | undefined>;
}

/** One `method + path` of the contract, with path-level parameters merged in. */
export interface Operation {
  /** `GET /v1/clubs/{club_id}`: the full path the API serves, used as the test name. */
  key: string;
  method: HttpMethod;
  /** Path as written in the contract, without the server prefix. */
  path: string;
  /** Path including the server prefix (`/v1`). */
  fullPath: string;
  operation: OperationObject;
  parameters: ParameterObject[];
  /** Security requirements that apply (operation-level or the global default). */
  security: SecurityRequirement[];
}

const require = createRequire(import.meta.url);

/** The contract of `packages/contracts`, parsed. */
export function loadContract(): OpenApiDocument {
  const path = require.resolve('@app/contracts/openapi/openapi.yaml');
  return parse(readFileSync(path, 'utf8')) as OpenApiDocument;
}

/** Server prefix from `servers[0].url` (`/v1`), without a trailing slash. */
export function serverPrefix(doc: OpenApiDocument): string {
  const url = doc.servers?.[0]?.url ?? '';
  return url.replace(/\/+$/, '');
}

export function isReference(value: unknown): value is Reference {
  return typeof value === 'object' && value !== null && '$ref' in value;
}

/** Follows local `#/...` references until it reaches an object that is not a reference. */
export function resolve<T>(doc: OpenApiDocument, value: T | Reference): T {
  let current: unknown = value;
  const seen = new Set<string>();
  while (isReference(current)) {
    const ref = current.$ref;
    if (!ref.startsWith('#/') || seen.has(ref)) {
      throw new Error(`Unsupported or circular reference: ${ref}`);
    }
    seen.add(ref);
    current = ref
      .slice(2)
      .split('/')
      .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
      .reduce<unknown>((node, segment) => {
        if (typeof node !== 'object' || node === null || !(segment in node)) {
          throw new Error(`Reference not found in the contract: ${ref}`);
        }
        return (node as Record<string, unknown>)[segment];
      }, doc);
  }
  return current as T;
}

/** Every operation in `paths`, in the order the contract lists them. */
export function listOperations(doc: OpenApiDocument): Operation[] {
  const prefix = serverPrefix(doc);
  const operations: Operation[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (operation === undefined) {
        continue;
      }
      const byKey = new Map<string, ParameterObject>();
      for (const parameter of [...(item.parameters ?? []), ...(operation.parameters ?? [])]) {
        const resolved = resolve<ParameterObject>(doc, parameter);
        byKey.set(`${resolved.in}:${resolved.name}`, resolved);
      }
      operations.push({
        key: `${method.toUpperCase()} ${prefix}${path}`,
        method,
        path,
        fullPath: `${prefix}${path}`,
        operation,
        parameters: [...byKey.values()],
        security: operation.security ?? doc.security ?? [],
      });
    }
  }
  return operations;
}

/** True when the operation can be called without credentials (`security: []` or `- {}`). */
export function isPublic(operation: Operation): boolean {
  return (
    operation.security.length === 0 ||
    operation.security.some((requirement) => Object.keys(requirement).length === 0)
  );
}
