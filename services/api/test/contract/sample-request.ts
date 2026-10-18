// Builds a request for an operation from the contract alone: examples when the contract has
// them, otherwise the smallest value its schema allows. Only required parameters are sent.
import {
  isReference,
  resolve,
  type JsonSchema,
  type MediaTypeObject,
  type OpenApiDocument,
  type Operation,
  type ParameterObject,
  type RequestBodyObject,
} from './openapi';

export interface SampleRequest {
  method: Operation['method'];
  /** Path with parameters filled in and the query string appended. */
  url: string;
  headers: Record<string, string>;
  /** JSON body, when the operation takes one. */
  body?: unknown;
  contentType?: string;
}

const FORMAT_SAMPLES: Record<string, string> = {
  uuid: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b',
  'date-time': '2026-10-17T21:30:00Z',
  date: '2026-10-17',
  time: '21:30:00Z',
  email: 'player@example.com',
  uri: 'https://example.com/',
  url: 'https://example.com/',
  ipv4: '192.0.2.1',
};

export function buildSampleRequest(doc: OpenApiDocument, operation: Operation): SampleRequest {
  let path = operation.fullPath;
  const query = new URLSearchParams();
  const headers: Record<string, string> = {};

  for (const parameter of operation.parameters) {
    if (parameter.in !== 'path' && parameter.required !== true) {
      continue;
    }
    const value = serialize(parameterSample(doc, parameter));
    if (parameter.in === 'path') {
      path = path.replace(`{${parameter.name}}`, encodeURIComponent(value));
    } else if (parameter.in === 'query') {
      query.set(parameter.name, value);
    } else if (parameter.in === 'header' && parameter.name.toLowerCase() !== 'authorization') {
      headers[parameter.name] = value;
    }
  }

  const request: SampleRequest = {
    method: operation.method,
    url: query.size > 0 ? `${path}?${query.toString()}` : path,
    headers,
  };

  const requestBody = operation.operation.requestBody;
  if (requestBody !== undefined) {
    const body = resolve<RequestBodyObject>(doc, requestBody);
    const entry = Object.entries(body.content ?? {}).find(([type]) => /json/i.test(type));
    if (entry !== undefined) {
      request.contentType = entry[0];
      request.body = mediaSample(doc, entry[1]);
    }
  }
  return request;
}

function parameterSample(doc: OpenApiDocument, parameter: ParameterObject): unknown {
  if (parameter.example !== undefined) {
    return parameter.example;
  }
  const example = firstExample(doc, parameter.examples);
  if (example !== undefined) {
    return example;
  }
  return sampleFromSchema(doc, parameter.schema ?? { type: 'string' });
}

function mediaSample(doc: OpenApiDocument, media: MediaTypeObject): unknown {
  if (media.example !== undefined) {
    return media.example;
  }
  return firstExample(doc, media.examples) ?? sampleFromSchema(doc, media.schema ?? {});
}

function firstExample(doc: OpenApiDocument, examples: MediaTypeObject['examples']): unknown {
  const first = Object.values(examples ?? {})[0];
  return first === undefined ? undefined : resolve<{ value?: unknown }>(doc, first).value;
}

/** The smallest value that satisfies `schema` (required properties only). */
export function sampleFromSchema(doc: OpenApiDocument, input: JsonSchema, depth = 0): unknown {
  const schema = isReference(input) ? resolve<JsonSchema>(doc, input) : input;
  if (depth > 20) {
    return null;
  }
  for (const key of ['const', 'default'] as const) {
    if (key in schema) {
      return schema[key];
    }
  }
  if (Array.isArray(schema.examples) && schema.examples.length > 0) {
    return schema.examples[0];
  }
  if ('example' in schema) {
    return schema.example;
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }
  if (Array.isArray(schema.allOf)) {
    return Object.assign(
      {},
      ...schema.allOf.map((part) => sampleFromSchema(doc, part as JsonSchema, depth + 1)),
    );
  }
  for (const key of ['oneOf', 'anyOf'] as const) {
    const options = schema[key];
    if (Array.isArray(options) && options.length > 0) {
      return sampleFromSchema(doc, options[0] as JsonSchema, depth + 1);
    }
  }
  const types = ([] as unknown[]).concat(schema.type ?? []).filter((type) => type !== 'null');
  const type = types[0] ?? ('properties' in schema ? 'object' : 'string');
  switch (type) {
    case 'object': {
      const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
      const required = (schema.required ?? []) as string[];
      return Object.fromEntries(
        required.map((name) => [name, sampleFromSchema(doc, properties[name] ?? {}, depth + 1)]),
      );
    }
    case 'array': {
      const count = Math.max(Number(schema.minItems ?? 0), 1);
      const items = (schema.items ?? {}) as JsonSchema;
      return Array.from({ length: count }, () => sampleFromSchema(doc, items, depth + 1));
    }
    case 'integer':
    case 'number': {
      if (typeof schema.minimum === 'number') {
        return schema.minimum;
      }
      if (typeof schema.exclusiveMinimum === 'number') {
        return type === 'integer'
          ? Math.floor(schema.exclusiveMinimum) + 1
          : schema.exclusiveMinimum + 1;
      }
      return 1;
    }
    case 'boolean':
      return false;
    default: {
      const format = typeof schema.format === 'string' ? FORMAT_SAMPLES[schema.format] : undefined;
      if (format !== undefined) {
        return format;
      }
      const minLength = typeof schema.minLength === 'number' ? schema.minLength : 1;
      return 'x'.repeat(Math.max(minLength, 1));
    }
  }
}

function serialize(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
