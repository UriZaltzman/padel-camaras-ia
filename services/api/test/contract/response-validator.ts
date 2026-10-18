// Checks an HTTP response against the OpenAPI 3.1 contract: status, headers and body.
//
// OpenAPI 3.1 schemas are JSON Schema 2020-12, so bodies and headers are validated with Ajv
// (MIT) in 2020-12 mode, with `ajv-formats` (MIT) for `uuid`, `date-time` and the rest.
//
// The check is stricter than plain JSON Schema in three ways, because a contract test must catch
// a response that says more than the contract does:
// - Objects are closed: a property the contract does not declare is an error, unless the schema
//   opts in with `additionalProperties` or `unevaluatedProperties`. Schemas used as `allOf`
//   building blocks (such as `Page`) are closed where they are combined, not on their own.
// - Every header a response declares must be present (the contract only declares headers the API
//   always sends) and match its schema.
// - Every response carries `X-Request-Id`, as the contract's conventions require, even when the
//   response object does not list it.
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import {
  resolve,
  type HeaderObject,
  type JsonSchema,
  type OpenApiDocument,
  type Operation,
  type Reference,
  type ResponseObject,
} from './openapi';

// ajv-formats is CommonJS; depending on the loader its default export arrives wrapped.
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ??
  addFormatsModule) as (ajv: Ajv2020) => Ajv2020;

export const REQUEST_ID_HEADER = 'X-Request-Id';

const CONTRACT_ID = 'contract.json';

/** What the validator needs from a response (supertest's `Response` fits). */
export interface ResponseLike {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text?: string;
  body?: unknown;
}

/** The documented response that applies to a status, and the key it was found under. */
export interface MatchedResponse {
  key: string;
  response: ResponseObject;
}

// Keywords that hold subschemas, by shape.
const SCHEMA_MAP_KEYWORDS = ['properties', 'patternProperties', '$defs', 'dependentSchemas'];
const SCHEMA_LIST_KEYWORDS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
const SCHEMA_KEYWORDS = [
  'additionalProperties',
  'unevaluatedProperties',
  'items',
  'contains',
  'not',
  'if',
  'then',
  'else',
  'propertyNames',
  'unevaluatedItems',
];

// OpenAPI keywords that are not JSON Schema. Ajv's strict mode rejects unknown keywords.
const OPENAPI_SCHEMA_KEYWORDS = ['discriminator', 'xml', 'externalDocs', 'example'];

// OpenAPI formats that ajv-formats does not define.
const OPENAPI_FORMATS: Record<string, (value: number | string) => boolean> = {
  int32: (value) => Number.isInteger(value) && Math.abs(Number(value)) <= 2 ** 31,
  int64: (value) => Number.isInteger(value),
  float: () => true,
  double: () => true,
  password: () => true,
  binary: () => true,
};

export class ContractValidator {
  private readonly bodies: Ajv2020;
  private readonly headers: Ajv2020;
  private readonly compiled = new Map<string, ValidateFunction>();

  constructor(private readonly doc: OpenApiDocument) {
    const mixins = findAllOfMixins(doc);
    const contract = {
      $id: CONTRACT_ID,
      components: closeComponents(doc.components ?? {}, mixins),
    };
    this.bodies = createAjv(doc, false);
    this.headers = createAjv(doc, true);
    this.bodies.addSchema(contract);
    this.headers.addSchema(contract);
  }

  /** The documented response for `status`: exact code first, then `4XX`-style ranges, then `default`. */
  matchResponse(operation: Operation, status: number): MatchedResponse | undefined {
    const responses = operation.operation.responses ?? {};
    for (const key of [String(status), `${String(status)[0]}XX`, 'default']) {
      const found = Object.keys(responses).find((candidate) => candidate.toUpperCase() === key);
      if (found !== undefined) {
        return {
          key: found,
          response: resolve<ResponseObject>(this.doc, responses[found] as ResponseObject),
        };
      }
    }
    return undefined;
  }

  /** Problems with `res` as a response of `operation`. Empty when it matches the contract. */
  validateOperationResponse(operation: Operation, res: ResponseLike): string[] {
    const matched = this.matchResponse(operation, res.status);
    if (matched === undefined) {
      const documented = Object.keys(operation.operation.responses ?? {}).join(', ');
      return [
        `${operation.key} answered ${res.status}, which the contract does not document (documented: ${documented || 'none'})`,
        ...this.requestIdProblems(res),
      ];
    }
    return this.validateResponse(matched.response, res, operation.method === 'head');
  }

  /** Problems with `res` against one response object (e.g. `#/components/responses/NotFound`). */
  validateResponse(
    response: ResponseObject | Reference,
    res: ResponseLike,
    isHead = false,
  ): string[] {
    const resolved = resolve<ResponseObject>(this.doc, response);
    return [
      ...this.requestIdProblems(res, resolved),
      ...this.headerProblems(resolved, res),
      ...this.bodyProblems(resolved, res, isHead),
    ];
  }

  private requestIdProblems(res: ResponseLike, response?: ResponseObject): string[] {
    const declared = Object.keys(response?.headers ?? {}).some(
      (name) => name.toLowerCase() === REQUEST_ID_HEADER.toLowerCase(),
    );
    if (declared) {
      return []; // Checked with the other declared headers.
    }
    if (headerValue(res, REQUEST_ID_HEADER) === undefined) {
      return [`missing header ${REQUEST_ID_HEADER}`];
    }
    const schema = this.doc.components?.headers?.[REQUEST_ID_HEADER];
    if (schema === undefined) {
      return [];
    }
    return this.headerProblems({ headers: { [REQUEST_ID_HEADER]: schema as HeaderObject } }, res);
  }

  private headerProblems(response: ResponseObject, res: ResponseLike): string[] {
    const problems: string[] = [];
    for (const [name, header] of Object.entries(response.headers ?? {})) {
      // Content-Type is described by `content`, never by `headers` (OpenAPI 3.1, 4.8.17.1).
      if (name.toLowerCase() === 'content-type') {
        continue;
      }
      const raw = headerValue(res, name);
      if (raw === undefined) {
        problems.push(`missing header ${name}`);
        continue;
      }
      const schema = resolve<HeaderObject>(this.doc, header).schema;
      if (schema === undefined) {
        continue;
      }
      const validate = this.compile(this.headers, {
        type: 'object',
        properties: { value: schema },
      });
      const data = { value: raw };
      if (!validate(data)) {
        problems.push(...formatErrors(validate, `header ${name}`));
      }
    }
    return problems;
  }

  private bodyProblems(response: ResponseObject, res: ResponseLike, isHead: boolean): string[] {
    const text = res.text ?? '';
    const content = response.content ?? {};
    const mediaTypes = Object.keys(content);
    if (mediaTypes.length === 0 || isHead) {
      return text.length > 0 && !isHead ? ['the contract declares no body, but one was sent'] : [];
    }
    const contentType = headerValue(res, 'content-type')?.split(';')[0]?.trim().toLowerCase();
    if (contentType === undefined) {
      return [`missing Content-Type (expected ${mediaTypes.join(' or ')})`];
    }
    const mediaType = mediaTypes.find((candidate) => mediaTypeMatches(candidate, contentType));
    if (mediaType === undefined) {
      return [`Content-Type ${contentType} is not one of ${mediaTypes.join(', ')}`];
    }
    const schema = content[mediaType]?.schema;
    if (schema === undefined) {
      return [];
    }
    const isJson = /^application\/(.+\+)?json$/.test(contentType);
    let body: unknown = res.body;
    if (isJson) {
      try {
        body = JSON.parse(text);
      } catch {
        return ['the body is not valid JSON'];
      }
    }
    // Close the top level here too, in case the schema is also used as an `allOf` block.
    const validate = this.compile(this.bodies, { allOf: [schema], unevaluatedProperties: false });
    return validate(body) ? [] : formatErrors(validate, 'body');
  }

  private compile(ajv: Ajv2020, schema: JsonSchema): ValidateFunction {
    const prepared = closeSchema(rewriteRefs(schema), false);
    const cacheKey = `${ajv === this.headers ? 'h' : 'b'}:${JSON.stringify(prepared)}`;
    let validate = this.compiled.get(cacheKey);
    if (validate === undefined) {
      validate = ajv.compile(prepared);
      this.compiled.set(cacheKey, validate);
    }
    return validate;
  }
}

function createAjv(doc: OpenApiDocument, coerceTypes: boolean): Ajv2020 {
  const ajv = new Ajv2020({ strict: true, strictTypes: false, allErrors: true, coerceTypes });
  addFormats(ajv);
  for (const [name, validate] of Object.entries(OPENAPI_FORMATS)) {
    ajv.addFormat(name, { validate });
  }
  // `components` is not a JSON Schema keyword; it only holds the schemas `$ref` points into.
  for (const keyword of ['components', ...OPENAPI_SCHEMA_KEYWORDS, ...vendorKeywords(doc)]) {
    ajv.addKeyword(keyword);
  }
  return ajv;
}

/** Every `x-...` key used in the contract, so Ajv's strict mode accepts them. */
function vendorKeywords(doc: OpenApiDocument): string[] {
  const found = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
    } else if (typeof node === 'object' && node !== null) {
      for (const [key, value] of Object.entries(node)) {
        if (key.startsWith('x-')) {
          found.add(key);
        }
        visit(value);
      }
    }
  };
  visit(doc.components);
  return [...found];
}

/** Local references become references into the contract document added to Ajv. */
function rewriteRefs<T>(node: T): T {
  if (Array.isArray(node)) {
    return node.map(rewriteRefs) as T;
  }
  if (typeof node !== 'object' || node === null) {
    return node;
  }
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) =>
      key === '$ref' && typeof value === 'string' && value.startsWith('#/')
        ? [key, `${CONTRACT_ID}${value}`]
        : [key, rewriteRefs(value)],
    ),
  ) as T;
}

/** Names of component schemas used as a `$ref` member of some `allOf`. */
function findAllOfMixins(doc: OpenApiDocument): Set<string> {
  const mixins = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object' || node === null) {
      return;
    }
    const allOf = (node as { allOf?: unknown }).allOf;
    if (Array.isArray(allOf)) {
      for (const member of allOf) {
        const ref = (member as Partial<Reference> | null)?.$ref;
        const match = typeof ref === 'string' ? /^#\/components\/schemas\/(.+)$/.exec(ref) : null;
        if (match?.[1] !== undefined) {
          mixins.add(match[1].replace(/~1/g, '/').replace(/~0/g, '~'));
        }
      }
    }
    Object.values(node).forEach(visit);
  };
  visit(doc);
  return mixins;
}

function closeComponents(
  components: NonNullable<OpenApiDocument['components']>,
  mixins: Set<string>,
): NonNullable<OpenApiDocument['components']> {
  const result: NonNullable<OpenApiDocument['components']> = rewriteRefs(components);
  const schemas = result.schemas;
  if (schemas !== undefined) {
    result.schemas = Object.fromEntries(
      Object.entries(schemas).map(([name, schema]) => [
        name,
        closeSchema(schema as JsonSchema, mixins.has(name)),
      ]),
    );
  }
  return result;
}

/**
 * Adds `unevaluatedProperties: false` to every object schema that does not say what to do with
 * undeclared properties. `allOf` members are left open and their parent is closed instead, since
 * 2020-12 `unevaluatedProperties` sees the properties declared by the members.
 */
function closeSchema(schema: JsonSchema, isMixin: boolean): JsonSchema {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return schema;
  }
  const result: JsonSchema = { ...schema };
  for (const keyword of SCHEMA_MAP_KEYWORDS) {
    const map = result[keyword];
    if (typeof map === 'object' && map !== null) {
      result[keyword] = Object.fromEntries(
        Object.entries(map).map(([key, value]) => [key, closeSchema(value as JsonSchema, false)]),
      );
    }
  }
  for (const keyword of SCHEMA_LIST_KEYWORDS) {
    const list = result[keyword];
    if (Array.isArray(list)) {
      result[keyword] = list.map((value) => closeSchema(value as JsonSchema, keyword === 'allOf'));
    }
  }
  for (const keyword of SCHEMA_KEYWORDS) {
    const value = result[keyword];
    if (typeof value === 'object' && value !== null) {
      result[keyword] = closeSchema(value as JsonSchema, false);
    }
  }
  const types = ([] as unknown[]).concat(result.type ?? []);
  const describesObject = types.includes('object') || 'properties' in result || 'allOf' in result;
  const saysWhatToDo = 'additionalProperties' in result || 'unevaluatedProperties' in result;
  if (describesObject && !saysWhatToDo && !isMixin && !('$ref' in result && types.length === 0)) {
    result.unevaluatedProperties = false;
  }
  return result;
}

function headerValue(res: ResponseLike, name: string): string | undefined {
  const value = res.headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(', ') : value;
}

function mediaTypeMatches(declared: string, actual: string): boolean {
  const pattern = declared.split(';')[0]?.trim().toLowerCase() ?? '';
  if (pattern === '*/*' || pattern === actual) {
    return true;
  }
  return pattern.endsWith('/*') && actual.startsWith(pattern.slice(0, -1));
}

function formatErrors(validate: ValidateFunction, where: string): string[] {
  return (validate.errors ?? []).map((error) => {
    const extra =
      error.keyword === 'unevaluatedProperties'
        ? ` (${String((error.params as { unevaluatedProperty?: string }).unevaluatedProperty)})`
        : '';
    return `${where}${error.instancePath || ''} ${error.message ?? error.keyword}${extra}`;
  });
}
